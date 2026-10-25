package os.robbie.lien;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.provider.Telephony;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.telecom.TelecomManager;

import org.json.JSONObject;

/**
 * Les notifications des autres applis du téléphone, montrées sur le bureau de Robbie OS
 * (seulement si on l'a permis : Réglages d'Android › Accès aux notifications).
 * Les SMS et les appels n'en font pas partie : ils arrivent déjà par leur propre chemin.
 */
public class NotificationsService extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        LienService service = LienService.instance;
        if (service == null || !LienService.relieMaintenant() || !new Reglages(this).droit("notifications")) return;
        if (ignorer(sbn)) return;
        Notification n = sbn.getNotification();
        CharSequence titre = n.extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence texte = n.extras.getCharSequence(Notification.EXTRA_TEXT);
        if (titre == null && texte == null) return;
        try {
            service.envoyerPlusTard(new JSONObject()
                .put("type", "notification")
                .put("id", sbn.getKey())
                .put("app", nomAppli(sbn.getPackageName()))
                .put("titre", titre == null ? "" : titre.toString())
                .put("texte", texte == null ? "" : texte.toString()));
        } catch (Exception ignored) {}
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        LienService service = LienService.instance;
        if (service == null || !LienService.relieMaintenant()) return;
        try {
            service.envoyerPlusTard(new JSONObject().put("type", "notification-fin").put("id", sbn.getKey()));
        } catch (Exception ignored) {}
    }

    private boolean ignorer(StatusBarNotification sbn) {
        String appli = sbn.getPackageName();
        if (getPackageName().equals(appli) || sbn.isOngoing()) return true;
        if ((sbn.getNotification().flags & Notification.FLAG_GROUP_SUMMARY) != 0) return true;
        if (appli.equals(Telephony.Sms.getDefaultSmsPackage(this))) return true;
        TelecomManager telecom = getSystemService(TelecomManager.class);
        return telecom != null && appli.equals(telecom.getDefaultDialerPackage());
    }

    private String nomAppli(String paquet) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(paquet, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (Exception e) {
            return paquet;
        }
    }
}
