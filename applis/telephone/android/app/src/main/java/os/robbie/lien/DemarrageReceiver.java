package os.robbie.lien;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Le téléphone redémarre (ou l'appli est mise à jour) : la liaison reprend toute seule */
public class DemarrageReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (new Reglages(context).configure()) LienService.demarrer(context);
    }
}
