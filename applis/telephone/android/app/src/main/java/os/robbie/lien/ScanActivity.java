package os.robbie.lien;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.widget.TextView;

import com.google.zxing.BarcodeFormat;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;
import com.journeyapps.barcodescanner.DefaultDecoderFactory;

import java.util.Collections;

/** Lire le code QR affiché dans Robbie OS › Réglages › Téléphone */
public class ScanActivity extends Activity {
    private DecoratedBarcodeView vue;

    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        setContentView(R.layout.activite_scan);
        vue = findViewById(R.id.lecteur);
        vue.getBarcodeView().setDecoderFactory(new DefaultDecoderFactory(Collections.singletonList(BarcodeFormat.QR_CODE)));
        vue.setStatusText("");
        findViewById(R.id.fermer).setOnClickListener(v -> finish());
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.CAMERA }, 1);
        }
        lire();
    }

    private void lire() {
        vue.decodeSingle(resultat -> {
            String texte = resultat.getText();
            if (texte != null && texte.startsWith("robbie-lien://relier")) {
                setResult(RESULT_OK, new Intent().setData(Uri.parse(texte)));
                finish();
            } else {
                ((TextView) findViewById(R.id.aide)).setText(R.string.scan_mauvais);
                lire();
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] resultats) {
        super.onRequestPermissionsResult(code, permissions, resultats);
        if (resultats.length > 0 && resultats[0] == PackageManager.PERMISSION_GRANTED) vue.resume();
        else ((TextView) findViewById(R.id.aide)).setText(R.string.scan_sans_camera);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) vue.resume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        vue.pause();
    }
}
