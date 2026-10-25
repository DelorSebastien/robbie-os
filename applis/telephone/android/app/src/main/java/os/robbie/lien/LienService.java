package os.robbie.lien;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.telecom.TelecomManager;
import android.telephony.SmsManager;
import android.telephony.TelephonyManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * La liaison avec l'ordinateur : une connexion chiffrée en Wi-Fi, gardée ouverte en arrière-plan.
 * L'ordinateur est reconnu à l'empreinte de son certificat (lue dans le code QR) ; lui reconnaît
 * le téléphone à son jeton. Les messages sont du JSON, un par ligne (même protocole que Robbie OS).
 */
public class LienService extends Service {
    static final String ACTION_ARRETER = "os.robbie.lien.ARRETER";
    private static final String CANAL = "liaison";
    private static final int NOTIFICATION = 1;
    private static final int DECOUVERTE = 47852;

    /** Le service en marche (null s'il ne tourne pas) */
    static volatile LienService instance;
    /** L'écran de l'appli suit l'état de la liaison */
    interface Suivi { void changement(); }
    static volatile Suivi suivi;

    enum Etat { ARRETE, RECHERCHE, CONNEXION, RELIE }
    static volatile Etat etat = Etat.ARRETE;

    private Reglages reglages;
    private volatile boolean enMarche;
    private volatile Socket socket;
    private OutputStream sortie;
    private Thread fil;
    private final ExecutorService travail = Executors.newSingleThreadExecutor();
    private final Handler principal = new Handler(Looper.getMainLooper());
    private WifiManager.WifiLock verrouWifi;

    // Appel en cours vu par le téléphone
    String numeroAppel;
    boolean appelEntrant;

    private int batterie = -1;
    private boolean enCharge;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        reglages = new Reglages(this);
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CANAL, getString(R.string.canal_liaison), NotificationManager.IMPORTANCE_MIN));
        registerReceiver(recepteurBatterie, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        WifiManager wifi = getApplicationContext().getSystemService(WifiManager.class);
        verrouWifi = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "robbie-lien");
        verrouWifi.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_ARRETER.equals(intent.getAction())) {
            arreter();
            return START_NOT_STICKY;
        }
        if (!reglages.configure()) {
            arreter();
            return START_NOT_STICKY;
        }
        Notification n = notification(getString(R.string.recherche));
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        else startForeground(NOTIFICATION, n);
        verrouWifi.acquire();
        if (fil == null || !fil.isAlive()) {
            enMarche = true;
            fil = new Thread(this::boucle, "robbie-lien");
            fil.start();
        } else {
            // (un nouveau code QR lu : on repart de zéro)
            fermerSocket();
        }
        return START_STICKY;
    }

    static void demarrer(Context c) {
        Intent i = new Intent(c, LienService.class);
        c.startForegroundService(i);
    }

    private void arreter() {
        enMarche = false;
        fermerSocket();
        changerEtat(Etat.ARRETE);
        if (verrouWifi.isHeld()) verrouWifi.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        enMarche = false;
        fermerSocket();
        try {
            unregisterReceiver(recepteurBatterie);
        } catch (Exception ignored) {}
        if (verrouWifi.isHeld()) verrouWifi.release();
        instance = null;
        etat = Etat.ARRETE;
        Suivi s = suivi;
        if (s != null) principal.post(s::changement);
        travail.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ---- La boucle de liaison : se connecter, écouter, recommencer si ça coupe ----
    private void boucle() {
        int attente = 3;
        while (enMarche && reglages.configure()) {
            changerEtat(Etat.CONNEXION);
            boolean connecte = false;
            for (String hote : reglages.hotes()) {
                if (!enMarche) return;
                if (connecter(hote, reglages.port())) {
                    connecte = true;
                    break;
                }
            }
            // (pas trouvé à l'adresse connue : on demande à tout le Wi-Fi où il est passé)
            if (!connecte && enMarche && chercher()) {
                connecte = connecter(reglages.hotes()[0], reglages.port());
            }
            if (connecte) {
                attente = 3;
                ecouter();
            }
            if (!enMarche) return;
            changerEtat(Etat.RECHERCHE);
            try {
                Thread.sleep(attente * 1000L);
            } catch (InterruptedException e) {
                return;
            }
            attente = Math.min(attente * 2, 60);
        }
        principal.post(this::arreter);
    }

    private boolean connecter(String hote, int port) {
        try {
            SSLContext ssl = SSLContext.getInstance("TLS");
            ssl.init(null, new TrustManager[] { new Epingle(reglages.empreinte()) }, null);
            Socket brut = new Socket();
            brut.connect(new InetSocketAddress(hote, port), 4000);
            SSLSocket s = (SSLSocket) ssl.getSocketFactory().createSocket(brut, hote, port, true);
            s.startHandshake();
            s.setSoTimeout(100000);
            socket = s;
            sortie = s.getOutputStream();
            // Premier message : la liaison (code du QR), ou le bonjour d'un téléphone déjà relié
            JSONObject m = new JSONObject();
            if (reglages.relie()) {
                m.put("type", "bonjour").put("id", reglages.idAppareil()).put("jeton", reglages.jeton()).put("nom", reglages.nomAppareil());
            } else {
                m.put("type", "relier").put("id", reglages.idAppareil()).put("code", reglages.code()).put("nom", reglages.nomAppareil()).put("modele", Build.MODEL);
            }
            envoyer(m);
            return true;
        } catch (Exception e) {
            fermerSocket();
            return false;
        }
    }

    /** « ROBBIE-LIEN? empreinte » à tout le réseau ; l'ordinateur répond « ROBBIE-LIEN! empreinte port » */
    private boolean chercher() {
        WifiManager wifi = getApplicationContext().getSystemService(WifiManager.class);
        WifiManager.MulticastLock verrou = wifi.createMulticastLock("robbie-lien");
        verrou.acquire();
        try (DatagramSocket ds = new DatagramSocket()) {
            ds.setBroadcast(true);
            ds.setSoTimeout(2500);
            byte[] question = ("ROBBIE-LIEN? " + reglages.empreinte()).getBytes(StandardCharsets.UTF_8);
            for (int essai = 0; essai < 2 && enMarche; essai++) {
                ds.send(new DatagramPacket(question, question.length, InetAddress.getByName("255.255.255.255"), DECOUVERTE));
                byte[] tampon = new byte[200];
                DatagramPacket reponse = new DatagramPacket(tampon, tampon.length);
                try {
                    ds.receive(reponse);
                } catch (Exception e) {
                    continue;
                }
                String[] mots = new String(tampon, 0, reponse.getLength(), StandardCharsets.UTF_8).trim().split(" ");
                if (mots.length == 3 && "ROBBIE-LIEN!".equals(mots[0]) && mots[1].equals(reglages.empreinte())) {
                    reglages.nouvelleAdresse(reponse.getAddress().getHostAddress(), Integer.parseInt(mots[2]));
                    return true;
                }
            }
        } catch (Exception ignored) {
        } finally {
            verrou.release();
        }
        return false;
    }

    private void ecouter() {
        try {
            BufferedReader entree = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            String ligne;
            while (enMarche && (ligne = entree.readLine()) != null) {
                if (ligne.trim().isEmpty()) continue;
                try {
                    recevoir(new JSONObject(ligne));
                } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {
        } finally {
            fermerSocket();
        }
    }

    private void fermerSocket() {
        Socket s = socket;
        socket = null;
        sortie = null;
        if (s != null) {
            try {
                s.close();
            } catch (Exception ignored) {}
        }
    }

    /** Envoyer un message à l'ordinateur (faux s'il n'est pas joignable) */
    synchronized boolean envoyer(JSONObject m) {
        OutputStream o = sortie;
        if (o == null) return false;
        try {
            o.write((m.toString() + "\n").getBytes(StandardCharsets.UTF_8));
            o.flush();
            return true;
        } catch (Exception e) {
            fermerSocket();
            return false;
        }
    }

    /** Envoi depuis n'importe quel fil (les récepteurs SMS, appels, notifications) */
    void envoyerPlusTard(JSONObject m) {
        travail.execute(() -> envoyer(m));
    }

    static boolean relieMaintenant() {
        return etat == Etat.RELIE;
    }

    // ---- Ce que l'ordinateur dit ----
    private void recevoir(JSONObject m) throws Exception {
        String type = m.optString("type");
        switch (type) {
            case "relie":
                reglages.relie(m.getString("jeton"), m.optString("nom", "l’ordinateur"));
                bienvenue();
                break;
            case "bienvenue":
                reglages.relie(reglages.jeton(), m.optString("nom", reglages.nomPc()));
                bienvenue();
                break;
            case "refuse":
                reglages.oublier(m.optString("raison", getString(R.string.refuse)));
                enMarche = false;
                principal.post(this::arreter);
                break;
            case "oublie":
                reglages.oublier(getString(R.string.oublie));
                enMarche = false;
                principal.post(this::arreter);
                break;
            case "ping":
                envoyer(new JSONObject().put("type", "pong"));
                break;
            case "sync":
                synchroniser(m.optString("quoi", ""));
                break;
            case "sms-envoyer":
                envoyerSms(m.optString("ref"), m.optString("numero"), m.optString("texte"));
                break;
            case "appeler":
                appeler(m.optString("numero"));
                break;
            case "decrocher":
                decrocher();
                break;
            case "raccrocher":
                raccrocher();
                break;
            case "micro":
                AudioManager audio = getSystemService(AudioManager.class);
                audio.setMicrophoneMute(m.optBoolean("coupe"));
                break;
            default:
                break;
        }
    }

    private void bienvenue() throws Exception {
        changerEtat(Etat.RELIE);
        envoyerDroits();
        envoyerEtat();
    }

    void envoyerDroits() {
        try {
            JSONObject m = new JSONObject().put("type", "droits");
            for (String d : Reglages.DROITS) m.put(d, reglages.droit(d));
            envoyerPlusTard(m);
        } catch (Exception ignored) {}
    }

    // Batterie et réseau mobile (affichés dans la barre de Robbie OS)
    private final BroadcastReceiver recepteurBatterie = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            int niveau = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int echelle = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            int statut = i.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            int pourcent = niveau < 0 ? -1 : Math.round(niveau * 100f / echelle);
            boolean charge = statut == BatteryManager.BATTERY_STATUS_CHARGING || statut == BatteryManager.BATTERY_STATUS_FULL;
            if (pourcent != batterie || charge != enCharge) {
                batterie = pourcent;
                enCharge = charge;
                if (relieMaintenant()) envoyerEtat();
            }
        }
    };

    @SuppressLint("MissingPermission")
    void envoyerEtat() {
        try {
            JSONObject m = new JSONObject().put("type", "etat");
            if (reglages.droit("batterie")) {
                if (batterie >= 0) m.put("batterie", batterie);
                m.put("charge", enCharge);
                TelephonyManager tm = getSystemService(TelephonyManager.class);
                if (tm != null) {
                    m.put("operateur", tm.getNetworkOperatorName());
                    if (Donnees.permis(this, Manifest.permission.READ_PHONE_STATE)) m.put("reseau", reseau(tm.getDataNetworkType()));
                    if (Build.VERSION.SDK_INT >= 28 && tm.getSignalStrength() != null) m.put("signal", tm.getSignalStrength().getLevel());
                }
            }
            envoyerPlusTard(m);
        } catch (Exception ignored) {}
    }

    private static String reseau(int type) {
        switch (type) {
            case TelephonyManager.NETWORK_TYPE_NR: return "5G";
            case TelephonyManager.NETWORK_TYPE_LTE: return "4G";
            case TelephonyManager.NETWORK_TYPE_HSPAP:
            case TelephonyManager.NETWORK_TYPE_HSPA:
            case TelephonyManager.NETWORK_TYPE_HSDPA:
            case TelephonyManager.NETWORK_TYPE_HSUPA:
            case TelephonyManager.NETWORK_TYPE_UMTS: return "3G";
            case TelephonyManager.NETWORK_TYPE_EDGE:
            case TelephonyManager.NETWORK_TYPE_GPRS: return "2G";
            default: return "";
        }
    }

    // ---- SMS, appels, contacts envoyés à l'ordinateur ----
    private void synchroniser(String quoi) {
        travail.execute(() -> {
            try {
                if ((quoi.isEmpty() || "sms".equals(quoi)) && reglages.droit("sms")) {
                    envoyer(new JSONObject().put("type", "sms-liste").put("messages", Donnees.sms(this)));
                }
                if ((quoi.isEmpty() || "appels".equals(quoi)) && reglages.droit("appels")) {
                    envoyer(new JSONObject().put("type", "appels-liste").put("appels", Donnees.appels(this)));
                }
                if (quoi.isEmpty() && reglages.droit("contacts")) {
                    envoyer(new JSONObject().put("type", "contacts").put("contacts", Donnees.contacts(this)));
                }
            } catch (Exception ignored) {}
        });
    }

    /** Un SMS arrivé (depuis SmsReceiver) */
    void smsRecu(String numero, String texte, long date) {
        if (!reglages.droit("sms") || !relieMaintenant()) return;
        try {
            JSONObject sms = new JSONObject().put("id", "r" + date).put("numero", numero).put("texte", texte).put("date", date).put("sens", "recu").put("lu", false);
            envoyerPlusTard(new JSONObject().put("type", "sms-recu").put("message", sms));
        } catch (Exception ignored) {}
    }

    private void envoyerSms(String ref, String numero, String texte) throws Exception {
        if (!reglages.droit("sms") || !Donnees.permis(this, Manifest.permission.SEND_SMS)) {
            envoyer(new JSONObject().put("type", "sms-envoye").put("ref", ref).put("ok", false).put("erreur", getString(R.string.sms_interdit)));
            return;
        }
        SmsManager sms = Build.VERSION.SDK_INT >= 31 ? getSystemService(SmsManager.class) : SmsManager.getDefault();
        ArrayList<String> parties = sms.divideMessage(texte);
        // Le résultat de l'envoi revient par ce récepteur (une fois par partie : la dernière fait foi)
        String action = "os.robbie.lien.SMS_ENVOYE." + ref;
        BroadcastReceiver resultat = new BroadcastReceiver() {
            int restant = parties.size();
            boolean echec;

            @Override
            public void onReceive(Context c, Intent i) {
                if (getResultCode() != android.app.Activity.RESULT_OK) echec = true;
                if (--restant > 0) return;
                try {
                    c.unregisterReceiver(this);
                    JSONObject m = new JSONObject().put("type", "sms-envoye").put("ref", ref).put("ok", !echec);
                    if (echec) m.put("erreur", getString(R.string.sms_echec));
                    envoyerPlusTard(m);
                } catch (Exception ignored) {}
            }
        };
        IntentFilter filtre = new IntentFilter(action);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(resultat, filtre, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(resultat, filtre);
        ArrayList<PendingIntent> envois = new ArrayList<>();
        for (int i = 0; i < parties.size(); i++) {
            envois.add(PendingIntent.getBroadcast(this, i, new Intent(action).setPackage(getPackageName()), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_ONE_SHOT));
        }
        sms.sendMultipartTextMessage(numero, null, parties, envois, null);
    }

    @SuppressLint("MissingPermission")
    private void appeler(String numero) {
        if (!reglages.droit("appels") || !Donnees.permis(this, Manifest.permission.CALL_PHONE)) return;
        numeroAppel = numero;
        appelEntrant = false;
        TelecomManager telecom = getSystemService(TelecomManager.class);
        telecom.placeCall(Uri.fromParts("tel", numero, null), null);
    }

    @SuppressLint("MissingPermission")
    private void decrocher() {
        if (!Donnees.permis(this, Manifest.permission.ANSWER_PHONE_CALLS)) return;
        getSystemService(TelecomManager.class).acceptRingingCall();
    }

    @SuppressLint("MissingPermission")
    private void raccrocher() {
        if (Build.VERSION.SDK_INT >= 28 && Donnees.permis(this, Manifest.permission.ANSWER_PHONE_CALLS)) {
            getSystemService(TelecomManager.class).endCall();
        }
    }

    // ---- État visible : notification et écran de l'appli ----
    private void changerEtat(Etat nouveau) {
        if (etat == nouveau) return;
        etat = nouveau;
        principal.post(() -> {
            if (nouveau != Etat.ARRETE) {
                String texte = nouveau == Etat.RELIE ? getString(R.string.relie_a, reglages.nomPc()) : getString(R.string.recherche);
                getSystemService(NotificationManager.class).notify(NOTIFICATION, notification(texte));
            }
            Suivi s = suivi;
            if (s != null) s.changement();
        });
    }

    private Notification notification(String texte) {
        PendingIntent ouvrir = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(texte)
            .setContentIntent(ouvrir)
            .setOngoing(true)
            .setShowWhen(false)
            .build();
    }

    /** N'accepte que le certificat de l'ordinateur relié (son empreinte SHA-256) */
    private static final class Epingle implements X509TrustManager {
        private final String attendue;

        Epingle(String attendue) { this.attendue = attendue; }

        @Override
        public void checkServerTrusted(X509Certificate[] chaine, String type) throws CertificateException {
            try {
                byte[] empreinte = MessageDigest.getInstance("SHA-256").digest(chaine[0].getEncoded());
                StringBuilder hex = new StringBuilder();
                for (byte b : empreinte) hex.append(String.format("%02x", b));
                if (attendue == null || !attendue.equals(hex.toString())) throw new CertificateException("Ce n’est pas l’ordinateur relié");
            } catch (CertificateException e) {
                throw e;
            } catch (Exception e) {
                throw new CertificateException(e);
            }
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chaine, String type) throws CertificateException {
            throw new CertificateException();
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
    }
}
