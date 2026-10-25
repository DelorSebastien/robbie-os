package os.robbie.lien;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.telephony.TelephonyManager;

import org.json.JSONObject;

/** Les appels du téléphone : ça sonne, décroché, terminé ; l'ordinateur suit et peut répondre */
public class AppelReceiver extends BroadcastReceiver {
    private static String dernierEtat = TelephonyManager.EXTRA_STATE_IDLE;

    @Override
    public void onReceive(Context context, Intent intent) {
        LienService service = LienService.instance;
        if (service == null || !LienService.relieMaintenant() || !new Reglages(context).droit("appels")) return;
        String etat = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        // (le numéro n'arrive que si on a le droit de lire le journal d'appels ; Android envoie
        // souvent l'annonce deux fois, avec et sans numéro)
        @SuppressWarnings("deprecation")
        String numero = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
        if (etat == null) return;
        try {
            JSONObject m = new JSONObject().put("type", "appel");
            if (TelephonyManager.EXTRA_STATE_RINGING.equals(etat)) {
                if (numero == null) return;
                service.numeroAppel = numero;
                service.appelEntrant = true;
                m.put("etat", "sonne").put("numero", numero).put("sens", "entrant");
            } else if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(etat)) {
                if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(dernierEtat) && numero == null) return;
                // (décroché sans avoir sonné : un appel qui part)
                boolean entrant = TelephonyManager.EXTRA_STATE_RINGING.equals(dernierEtat);
                m.put("etat", "decroche").put("sens", entrant ? "entrant" : "sortant");
                String connu = numero != null ? numero : service.numeroAppel;
                if (connu != null) m.put("numero", connu);
            } else {
                if (TelephonyManager.EXTRA_STATE_IDLE.equals(dernierEtat)) return;
                m.put("etat", "termine");
                service.numeroAppel = null;
            }
            dernierEtat = etat;
            service.envoyerPlusTard(m);
        } catch (Exception ignored) {}
    }
}
