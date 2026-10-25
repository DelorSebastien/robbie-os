package os.robbie.lien;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.LinkedHashMap;
import java.util.Map;

/** Un SMS reçu : il part aussitôt vers l'ordinateur (un long SMS arrive en morceaux, recollés ici) */
public class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        LienService service = LienService.instance;
        if (service == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] morceaux = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (morceaux == null) return;
        Map<String, StringBuilder> parNumero = new LinkedHashMap<>();
        long date = System.currentTimeMillis();
        for (SmsMessage morceau : morceaux) {
            String numero = morceau.getDisplayOriginatingAddress();
            if (numero == null) continue;
            StringBuilder texte = parNumero.get(numero);
            if (texte == null) parNumero.put(numero, texte = new StringBuilder());
            texte.append(morceau.getDisplayMessageBody());
            date = morceau.getTimestampMillis();
        }
        for (Map.Entry<String, StringBuilder> sms : parNumero.entrySet()) service.smsRecu(sms.getKey(), sms.getValue().toString(), date);
    }
}
