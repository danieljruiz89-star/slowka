package pl.daniel.slowka;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/** Aviso diario a la hora que elige Daniel. No avisa si ese dia ya ha practicado. */
public class Recordatorio extends BroadcastReceiver {
    private static final String AVISO = "pl.daniel.slowka.AVISO";
    private static final String[] FRASES = {
            "Tu racha te espera. Cinco minutos y la flor sigue viva 🌼",
            "Hoy toca repasar unas palabras. Chodźmy! 🚇",
            "¿Un trabalenguas rápido? Szczebrzeszyn te llama 🪲",
            "Tus palabras de hoy están listas. Do dzieła! 💪",
    };

    static void programar(Context c) {
        SharedPreferences p = c.getSharedPreferences("slowka", Context.MODE_PRIVATE);
        String hora = p.getString("hora", "");
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, new Intent(c, Recordatorio.class).setAction(AVISO),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        if (hora == null || !hora.matches("\\d{1,2}:\\d{2}")) return;
        String[] hm = hora.split(":");
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm[0]));
        cal.set(Calendar.MINUTE, Integer.parseInt(hm[1]));
        cal.set(Calendar.SECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) cal.add(Calendar.DAY_OF_YEAR, 1);
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(i.getAction())) { programar(c); return; }
        if (!AVISO.equals(i.getAction())) return;
        String hoy = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        if (hoy.equals(c.getSharedPreferences("slowka", Context.MODE_PRIVATE).getString("ultimo", ""))) return;

        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel("diario", "Recordatorio diario", NotificationManager.IMPORTANCE_DEFAULT));
        }
        PendingIntent abrir = PendingIntent.getActivity(c, 2, new Intent(c, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, "diario") : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_aviso)
                .setContentTitle("Słówka")
                .setContentText(FRASES[(int) (System.currentTimeMillis() / 86400000L % FRASES.length)])
                .setContentIntent(abrir)
                .setAutoCancel(true);
        try { nm.notify(1, b.build()); } catch (SecurityException ignored) { }
    }
}
