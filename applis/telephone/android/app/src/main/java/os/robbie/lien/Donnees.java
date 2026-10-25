package os.robbie.lien;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.CallLog;
import android.provider.ContactsContract;
import android.provider.Telephony;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;

/** Ce que le téléphone montre à l'ordinateur : SMS, journal des appels, contacts. */
final class Donnees {
    private static final int MAX_SMS = 3000;
    private static final int MAX_APPELS = 400;

    private Donnees() {}

    static boolean permis(Context c, String... permissions) {
        for (String permission : permissions) {
            if (c.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    /** Les derniers SMS, reçus et envoyés */
    static JSONArray sms(Context c) throws JSONException {
        JSONArray liste = new JSONArray();
        if (!permis(c, Manifest.permission.READ_SMS)) return liste;
        String[] colonnes = { Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE, Telephony.Sms.READ };
        try (Cursor cur = c.getContentResolver().query(Telephony.Sms.CONTENT_URI, colonnes, null, null, Telephony.Sms.DATE + " DESC")) {
            if (cur == null) return liste;
            while (cur.moveToNext() && liste.length() < MAX_SMS) {
                int type = cur.getInt(4);
                if (type != Telephony.Sms.MESSAGE_TYPE_INBOX && type != Telephony.Sms.MESSAGE_TYPE_SENT) continue;
                String numero = cur.getString(1);
                if (numero == null) continue;
                JSONObject sms = new JSONObject();
                sms.put("id", cur.getLong(0));
                sms.put("numero", numero);
                sms.put("texte", cur.getString(2) == null ? "" : cur.getString(2));
                sms.put("date", cur.getLong(3));
                sms.put("sens", type == Telephony.Sms.MESSAGE_TYPE_SENT ? "envoye" : "recu");
                sms.put("lu", cur.getInt(5) == 1);
                liste.put(sms);
            }
        }
        return liste;
    }

    /** Le journal des appels */
    static JSONArray appels(Context c) throws JSONException {
        JSONArray liste = new JSONArray();
        if (!permis(c, Manifest.permission.READ_CALL_LOG)) return liste;
        String[] colonnes = { CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION };
        try (Cursor cur = c.getContentResolver().query(CallLog.Calls.CONTENT_URI, colonnes, null, null, CallLog.Calls.DATE + " DESC")) {
            if (cur == null) return liste;
            while (cur.moveToNext() && liste.length() < MAX_APPELS) {
                JSONObject appel = new JSONObject();
                appel.put("id", cur.getLong(0));
                appel.put("numero", cur.getString(1) == null ? "" : cur.getString(1));
                int type = cur.getInt(2);
                appel.put("sens", type == CallLog.Calls.OUTGOING_TYPE ? "sortant" : type == CallLog.Calls.MISSED_TYPE ? "manque" : type == CallLog.Calls.REJECTED_TYPE ? "refuse" : "entrant");
                appel.put("date", cur.getLong(3));
                appel.put("duree", cur.getLong(4));
                liste.put(appel);
            }
        }
        return liste;
    }

    /** Les contacts : nom, numéros, adresses e-mail */
    static JSONArray contacts(Context c) throws JSONException {
        JSONArray liste = new JSONArray();
        if (!permis(c, Manifest.permission.READ_CONTACTS)) return liste;
        Map<Long, JSONObject> parId = new LinkedHashMap<>();
        String[] colonnes = { ContactsContract.Data.CONTACT_ID, ContactsContract.Data.DISPLAY_NAME, ContactsContract.Data.MIMETYPE, ContactsContract.Data.DATA1 };
        String filtre = ContactsContract.Data.MIMETYPE + " IN (?, ?)";
        String[] valeurs = { ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE, ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE };
        try (Cursor cur = c.getContentResolver().query(ContactsContract.Data.CONTENT_URI, colonnes, filtre, valeurs, ContactsContract.Data.DISPLAY_NAME + " ASC")) {
            if (cur == null) return liste;
            while (cur.moveToNext()) {
                String nom = cur.getString(1);
                String valeur = cur.getString(3);
                if (nom == null || valeur == null) continue;
                JSONObject contact = parId.get(cur.getLong(0));
                if (contact == null) {
                    contact = new JSONObject();
                    contact.put("nom", nom);
                    contact.put("numeros", new JSONArray());
                    contact.put("emails", new JSONArray());
                    parId.put(cur.getLong(0), contact);
                }
                boolean email = ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE.equals(cur.getString(2));
                contact.getJSONArray(email ? "emails" : "numeros").put(valeur);
            }
        }
        for (JSONObject contact : parId.values()) liste.put(contact);
        return liste;
    }
}
