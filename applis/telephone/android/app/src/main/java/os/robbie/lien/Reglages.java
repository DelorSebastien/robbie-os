package os.robbie.lien;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import java.util.Locale;
import java.util.UUID;

/** Ce que Robbie Lien garde : l'ordinateur relié (adresse, empreinte, jeton) et ce qu'il a le droit de faire. */
final class Reglages {
    static final String[] DROITS = { "sms", "appels", "contacts", "notifications", "batterie" };

    private final SharedPreferences p;

    Reglages(Context context) {
        p = context.getSharedPreferences("robbie-lien", Context.MODE_PRIVATE);
    }

    /** Identifiant de ce téléphone (tiré une fois) */
    String idAppareil() {
        String id = p.getString("id", null);
        if (id == null) {
            id = UUID.randomUUID().toString();
            p.edit().putString("id", id).apply();
        }
        return id;
    }

    String nomAppareil() {
        String fabricant = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String modele = Build.MODEL == null ? "Téléphone" : Build.MODEL;
        String nom = modele.toLowerCase(Locale.ROOT).startsWith(fabricant.toLowerCase(Locale.ROOT)) ? modele : (fabricant + " " + modele).trim();
        return nom.isEmpty() ? "Téléphone" : Character.toUpperCase(nom.charAt(0)) + nom.substring(1);
    }

    // ---- L'ordinateur ----
    boolean relie() { return p.getString("jeton", null) != null; }
    boolean enLiaison() { return p.getString("code", null) != null; }
    boolean configure() { return relie() || enLiaison(); }
    String empreinte() { return p.getString("empreinte", null); }
    String jeton() { return p.getString("jeton", null); }
    String code() { return p.getString("code", null); }
    String nomPc() { return p.getString("nomPc", "l’ordinateur"); }
    int port() { return p.getInt("port", 47851); }
    String[] hotes() {
        String h = p.getString("hotes", "");
        return h.isEmpty() ? new String[0] : h.split(",");
    }

    /** Le code QR lu : robbie-lien://relier?h=adresses&p=port&e=empreinte&c=code&n=nom */
    boolean relier(Uri uri) {
        if (uri == null || !"robbie-lien".equals(uri.getScheme()) || !"relier".equals(uri.getHost())) return false;
        String hotes = uri.getQueryParameter("h");
        String empreinte = uri.getQueryParameter("e");
        String code = uri.getQueryParameter("c");
        if (hotes == null || empreinte == null || code == null || !empreinte.matches("[0-9a-f]{64}")) return false;
        int port;
        try {
            port = Integer.parseInt(uri.getQueryParameter("p"));
        } catch (Exception e) {
            port = 47851;
        }
        String nom = uri.getQueryParameter("n");
        p.edit()
            .putString("hotes", hotes)
            .putInt("port", port)
            .putString("empreinte", empreinte)
            .putString("code", code)
            .putString("nomPc", nom == null ? "l’ordinateur" : nom)
            .remove("jeton")
            .remove("erreur")
            .apply();
        return true;
    }

    void relie(String jeton, String nomPc) {
        p.edit().putString("jeton", jeton).putString("nomPc", nomPc).remove("code").remove("erreur").apply();
    }

    void nouvelleAdresse(String hote, int port) {
        p.edit().putString("hotes", hote).putInt("port", port).apply();
    }

    void oublier(String erreur) {
        p.edit().remove("jeton").remove("code").remove("empreinte").remove("hotes").putString("erreur", erreur).apply();
    }

    String erreur() { return p.getString("erreur", null); }

    // ---- Droits de l'ordinateur ----
    boolean droit(String nom) {
        return p.getBoolean("droit-" + nom, !"notifications".equals(nom));
    }

    void setDroit(String nom, boolean oui) {
        p.edit().putBoolean("droit-" + nom, oui).apply();
    }
}
