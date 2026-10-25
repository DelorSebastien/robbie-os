package os.robbie.lien;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/**
 * L'écran de Robbie Lien : l'ordinateur relié, ce qu'il a le droit de faire, et « Relier un
 * ordinateur » (maquette « Téléphone Robbie OS », écran 5).
 */
public class MainActivity extends Activity implements LienService.Suivi {
    private static final int SCAN = 1;
    private static final int PERMISSIONS = 2;

    private Reglages reglages;
    private final List<Switch> interrupteurs = new ArrayList<>();
    private String droitDemande;

    // Les options : droit, icône, couleur, titre, détail
    private static final Object[][] OPTIONS = {
        { "sms", R.drawable.ic_bulle, 0xFFFFD2A6, R.string.option_sms, R.string.option_sms_detail },
        { "appels", R.drawable.ic_telephone, 0xFF7FF0BB, R.string.option_appels, R.string.option_appels_detail },
        { "contacts", R.drawable.ic_personne, 0xFFB48CFF, R.string.option_contacts, R.string.option_contacts_detail },
        { "notifications", R.drawable.ic_cloche, 0xFF5EE7FF, R.string.option_notifications, R.string.option_notifications_detail },
        { "batterie", R.drawable.ic_batterie, 0xFFFF8FBF, R.string.option_batterie, R.string.option_batterie_detail },
    };

    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        reglages = new Reglages(this);
        setContentView(R.layout.activite_principale);

        LinearLayout options = findViewById(R.id.options);
        LayoutInflater inflater = getLayoutInflater();
        for (int i = 0; i < OPTIONS.length; i++) {
            Object[] o = OPTIONS[i];
            View ligne = inflater.inflate(R.layout.ligne_option, options, false);
            ImageView icone = ligne.findViewById(R.id.icone);
            icone.setImageResource((int) o[1]);
            icone.setColorFilter((int) o[2]);
            ((TextView) ligne.findViewById(R.id.titre)).setText((int) o[3]);
            ((TextView) ligne.findViewById(R.id.detail)).setText((int) o[4]);
            ligne.findViewById(R.id.separateur).setVisibility(i == 0 ? View.GONE : View.VISIBLE);
            Switch interrupteur = ligne.findViewById(R.id.interrupteur);
            String droit = (String) o[0];
            interrupteur.setTag(droit);
            interrupteur.setContentDescription(getString((int) o[3]));
            interrupteur.setOnCheckedChangeListener((vue, oui) -> changerDroit(droit, oui));
            ligne.setOnClickListener(v -> interrupteur.toggle());
            interrupteurs.add(interrupteur);
            options.addView(ligne);
        }

        findViewById(R.id.relier).setOnClickListener(v -> startActivityForResult(new Intent(this, ScanActivity.class), SCAN));
        // (appui long sur la carte : oublier cet ordinateur)
        findViewById(R.id.carte).setOnLongClickListener(v -> {
            if (!reglages.configure()) return false;
            new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(R.string.oublier_titre)
                .setMessage(getString(R.string.oublier_texte, reglages.nomPc()))
                .setPositiveButton(R.string.oublier, (d, w) -> {
                    reglages.oublier(null);
                    startService(new Intent(this, LienService.class).setAction(LienService.ACTION_ARRETER));
                    afficher();
                })
                .setNegativeButton(R.string.annuler, null)
                .show();
            return true;
        });

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 0);
        }
        lireLien(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        lireLien(intent);
    }

    // Lien robbie-lien://relier… (code QR lu par l'appareil photo du téléphone, ou par notre lecteur)
    private void lireLien(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null) return;
        if (reglages.relier(uri)) {
            demanderPermissionsDeBase();
            LienService.demarrer(this);
        }
        afficher();
    }

    @Override
    protected void onResume() {
        super.onResume();
        LienService.suivi = this;
        // (la liaison reprend si elle s'était arrêtée)
        if (reglages.configure() && LienService.instance == null) LienService.demarrer(this);
        afficher();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (LienService.suivi == this) LienService.suivi = null;
    }

    @Override
    public void changement() {
        afficher();
    }

    private void afficher() {
        TextView nom = findViewById(R.id.nom_pc);
        TextView etat = findViewById(R.id.etat);
        TextView texte = findViewById(R.id.texte_carte);
        View carte = findViewById(R.id.carte);
        View boiteIcone = findViewById(R.id.boite_icone);
        ImageView icone = findViewById(R.id.icone_pc);
        View point = findViewById(R.id.point);
        TextView bouton = findViewById(R.id.relier_texte);

        boolean relie = LienService.etat == LienService.Etat.RELIE;
        if (!reglages.configure()) {
            nom.setText(R.string.aucun_pc);
            String erreur = reglages.erreur();
            etat.setText(erreur != null ? erreur : getString(R.string.pas_relie));
            etat.setTextColor(0x9EE2EAF8);
            texte.setText(R.string.texte_pas_relie);
            carte.setBackgroundResource(R.drawable.carte);
            boiteIcone.setBackgroundResource(R.drawable.boite_icone_grise);
            icone.setColorFilter(0x9EE2EAF8);
            point.setVisibility(View.GONE);
            bouton.setText(R.string.relier);
        } else {
            nom.setText(reglages.nomPc());
            etat.setText(relie ? R.string.relie_wifi : reglages.enLiaison() ? R.string.liaison_en_cours : R.string.recherche);
            int couleur = relie ? 0xFF7FF0BB : 0xFFFFD25C;
            etat.setTextColor(couleur);
            texte.setText(R.string.texte_relie);
            carte.setBackgroundResource(relie ? R.drawable.carte_verte : R.drawable.carte_attente);
            boiteIcone.setBackgroundResource(relie ? R.drawable.boite_icone_verte : R.drawable.boite_icone_attente);
            icone.setColorFilter(couleur);
            point.setVisibility(View.VISIBLE);
            point.getBackground().setTint(couleur);
            bouton.setText(R.string.relier_autre);
        }
        for (Switch interrupteur : interrupteurs) {
            String droit = (String) interrupteur.getTag();
            boolean oui = reglages.droit(droit) && permisPour(droit);
            interrupteur.setOnCheckedChangeListener(null);
            interrupteur.setChecked(oui);
            interrupteur.setOnCheckedChangeListener((vue, valeur) -> changerDroit(droit, valeur));
        }
    }

    // ---- Droits : chaque option demande les permissions d'Android qui vont avec ----
    private static String[] permissions(String droit) {
        switch (droit) {
            case "sms": return new String[] { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS, Manifest.permission.SEND_SMS };
            case "appels": return new String[] { Manifest.permission.READ_PHONE_STATE, Manifest.permission.READ_CALL_LOG, Manifest.permission.CALL_PHONE, Manifest.permission.ANSWER_PHONE_CALLS };
            case "contacts": return new String[] { Manifest.permission.READ_CONTACTS };
            default: return new String[0];
        }
    }

    private boolean permisPour(String droit) {
        if ("notifications".equals(droit)) return accesNotifications();
        return Donnees.permis(this, permissions(droit));
    }

    private boolean accesNotifications() {
        String actifs = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return actifs != null && actifs.contains(new ComponentName(this, NotificationsService.class).flattenToString());
    }

    private void changerDroit(String droit, boolean oui) {
        reglages.setDroit(droit, oui);
        if (oui && !permisPour(droit)) {
            if ("notifications".equals(droit)) {
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            } else {
                droitDemande = droit;
                requestPermissions(permissions(droit), PERMISSIONS);
            }
        }
        LienService service = LienService.instance;
        if (service != null) {
            service.envoyerDroits();
            service.envoyerEtat();
        }
    }

    // À la liaison : SMS, appels et contacts sont proposés d'un coup
    private void demanderPermissionsDeBase() {
        List<String> manquantes = new ArrayList<>();
        for (String droit : new String[] { "sms", "appels", "contacts" }) {
            if (!reglages.droit(droit)) continue;
            for (String p : permissions(droit)) {
                if (checkSelfPermission(p) != android.content.pm.PackageManager.PERMISSION_GRANTED) manquantes.add(p);
            }
        }
        if (!manquantes.isEmpty()) requestPermissions(manquantes.toArray(new String[0]), PERMISSIONS);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] resultats) {
        super.onRequestPermissionsResult(code, permissions, resultats);
        // (permission refusée : l'option se coupe)
        if (droitDemande != null && !permisPour(droitDemande)) reglages.setDroit(droitDemande, false);
        droitDemande = null;
        LienService service = LienService.instance;
        if (service != null) {
            service.envoyerDroits();
            service.envoyerEtat();
        }
        afficher();
    }

    @Override
    protected void onActivityResult(int code, int resultat, Intent donnees) {
        super.onActivityResult(code, resultat, donnees);
        if (code == SCAN && resultat == RESULT_OK && donnees != null) lireLien(donnees);
    }
}
