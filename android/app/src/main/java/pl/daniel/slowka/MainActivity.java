package pl.daniel.slowka;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/**
 * La app es una pagina local (assets/index.html) dentro de un WebView.
 * Esta clase le da lo que el WebView no tiene: voz polaca del movil, reconocimiento
 * de voz en polaco para la pronunciacion, vibracion, recordatorio diario y abrir enlaces.
 * Todo el progreso vive en el localStorage del WebView (datos de la app, sin internet).
 */
public class MainActivity extends Activity {
    private static final Locale PL = new Locale("pl", "PL");
    private static final int PERMISO_MICRO = 7;
    private static final int PERMISO_AVISOS = 8;

    private WebView web;
    private TextToSpeech tts;
    private volatile String ttsEstado = "cargando";   // cargando | ok | falta | error
    private SpeechRecognizer oido;
    private boolean escuchando = false;
    private String pendienteEscucha = null;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#0B1030"));
        getWindow().setNavigationBarColor(Color.parseColor("#0B1030"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0B1030"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                if (url.startsWith("file:")) return false;
                abrirFuera(url);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Puente(), "Nativo");
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");

        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) { ttsEstado = "error"; return; }
            int r = tts.setLanguage(PL);
            ttsEstado = (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) ? "falta" : "ok";
            if ("ok".equals(ttsEstado)) elegirMejorVoz();
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { js("window.alHablar&&alHablar('empieza')"); }
                @Override public void onDone(String id) { js("window.alHablar&&alHablar('fin')"); }
                @Override public void onError(String id) { js("window.alHablar&&alHablar('fin')"); }
            });
            js("window.alVoz&&alVoz('" + ttsEstado + "')");
        });

        Recordatorio.programar(this);
    }

    /** Prefiere una voz polaca de buena calidad que no necesite internet. */
    private void elegirMejorVoz() {
        try {
            Voice mejor = null;
            for (Voice v : tts.getVoices()) {
                if (v.getLocale() == null || !"pl".equals(v.getLocale().getLanguage())) continue;
                boolean red = v.isNetworkConnectionRequired();
                if (mejor == null
                        || (mejor.isNetworkConnectionRequired() && !red)
                        || (mejor.isNetworkConnectionRequired() == red && v.getQuality() > mejor.getQuality())) {
                    mejor = v;
                }
            }
            if (mejor != null) tts.setVoice(mejor);
        } catch (Exception ignored) { }
    }

    private void js(String code) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    private void abrirFuera(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) { }
    }

    // ---------- reconocimiento de voz (pronunciacion) ----------

    private void empezarEscucha(String pista) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            js("window.alOir&&alOir({tipo:'error',codigo:'sin_servicio'})");
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendienteEscucha = pista;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, PERMISO_MICRO);
            return;
        }
        if (oido == null) {
            oido = SpeechRecognizer.createSpeechRecognizer(this);
            oido.setRecognitionListener(new Oyente());
        }
        if (escuchando) oido.cancel();
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pl-PL");
        i.putExtra("android.speech.extra.EXTRA_ADDITIONAL_LANGUAGES", new String[]{"pl-PL"});
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        if (pista != null && !pista.isEmpty() && Build.VERSION.SDK_INT >= 33) {
            ArrayList<String> sesgo = new ArrayList<>();
            sesgo.add(pista);
            i.putStringArrayListExtra("android.speech.extra.BIASING_STRINGS", sesgo);
        }
        escuchando = true;
        oido.startListening(i);
    }

    private class Oyente implements RecognitionListener {
        @Override public void onReadyForSpeech(Bundle p) { js("window.alOir&&alOir({tipo:'listo'})"); }
        @Override public void onBeginningOfSpeech() { js("window.alOir&&alOir({tipo:'habla'})"); }
        @Override public void onRmsChanged(float db) { js("window.alOir&&alOir({tipo:'nivel',v:" + db + "})"); }
        @Override public void onBufferReceived(byte[] buf) { }
        @Override public void onEndOfSpeech() { js("window.alOir&&alOir({tipo:'fin_habla'})"); }
        @Override public void onError(int code) {
            escuchando = false;
            js("window.alOir&&alOir({tipo:'error',codigo:" + code + "})");
        }
        @Override public void onResults(Bundle r) {
            escuchando = false;
            enviar("final", r);
        }
        @Override public void onPartialResults(Bundle r) { enviar("parcial", r); }
        @Override public void onEvent(int t, Bundle p) { }

        private void enviar(String tipo, Bundle r) {
            try {
                ArrayList<String> textos = r.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                float[] conf = r.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
                JSONObject o = new JSONObject();
                o.put("tipo", tipo);
                JSONArray t = new JSONArray();
                if (textos != null) for (String x : textos) t.put(x);
                o.put("textos", t);
                JSONArray c = new JSONArray();
                if (conf != null) for (float x : conf) c.put((double) x);
                o.put("conf", c);
                js("window.alOir&&alOir(" + o + ")");
            } catch (Exception ignored) { }
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        if (req == PERMISO_MICRO) {
            if (ok) {
                String p = pendienteEscucha;
                pendienteEscucha = null;
                empezarEscucha(p);
            } else {
                js("window.alOir&&alOir({tipo:'error',codigo:'sin_permiso'})");
            }
        }
    }

    // ---------- lo que la pagina puede pedir ----------

    private class Puente {
        @JavascriptInterface public String voz() { return ttsEstado; }

        @JavascriptInterface public void hablar(String texto, float velocidad) {
            if (!"ok".equals(ttsEstado)) return;
            tts.setSpeechRate(velocidad);
            tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "s" + System.nanoTime());
        }

        @JavascriptInterface public void callar() { if (tts != null) tts.stop(); }

        @JavascriptInterface public boolean puedeEscuchar() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface public void escuchar(String pista) { runOnUiThread(() -> empezarEscucha(pista)); }

        @JavascriptInterface public void pararEscucha() {
            runOnUiThread(() -> { if (oido != null && escuchando) oido.stopListening(); });
        }

        @JavascriptInterface public void vibrar(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v == null) return;
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(ms);
            } catch (Exception ignored) { }
        }

        @JavascriptInterface public int versionCode() {
            try {
                android.content.pm.PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
                return Build.VERSION.SDK_INT >= 28 ? (int) p.getLongVersionCode() : p.versionCode;
            } catch (Exception e) { return 0; }
        }

        @JavascriptInterface public String versionName() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
            catch (Exception e) { return ""; }
        }

        @JavascriptInterface public void abrir(String url) { abrirFuera(url); }

        /** Abre los ajustes de voz del movil para instalar la voz polaca. */
        @JavascriptInterface public void ajustesVoz() {
            try {
                startActivity(new Intent("com.android.settings.TTS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception e) {
                try { startActivity(new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                catch (Exception ignored) { }
            }
        }

        /** Hora del recordatorio diario (por ejemplo "19:30"), o "" para quitarlo. */
        @JavascriptInterface public void recordatorio(String hora) {
            getSharedPreferences("slowka", MODE_PRIVATE).edit().putString("hora", hora).apply();
            if (!hora.isEmpty() && Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISO_AVISOS));
            }
            Recordatorio.programar(MainActivity.this);
        }

        /** El recordatorio no avisa si ya has practicado hoy. */
        @JavascriptInterface public void practicadoHoy(String fecha) {
            getSharedPreferences("slowka", MODE_PRIVATE).edit().putString("ultimo", fecha).apply();
        }

        @JavascriptInterface public void pantallaEncendida(boolean si) {
            runOnUiThread(() -> {
                if (si) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** Copia de seguridad: abre "Compartir" con el progreso en texto (a WhatsApp, Drive, correo...). */
        @JavascriptInterface public void compartir(String texto) {
            Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, "Copia de Słówka")
                    .putExtra(Intent.EXTRA_TEXT, texto);
            runOnUiThread(() -> startActivity(Intent.createChooser(i, "Guardar copia")));
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.atras?atras():false", v -> {
            if (!"true".equals(v)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (oido != null && escuchando) { oido.cancel(); escuchando = false; }
        if (tts != null) tts.stop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        js("window.alVolver&&alVolver()");
    }

    @Override
    protected void onDestroy() {
        if (oido != null) oido.destroy();
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }
}
