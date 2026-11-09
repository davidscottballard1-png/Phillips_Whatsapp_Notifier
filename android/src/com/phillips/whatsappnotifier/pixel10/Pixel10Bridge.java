package com.phillips.whatsappnotifier.pixel10;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.CalendarContract;
import android.provider.Settings;
import android.telephony.SmsManager;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.webkit.JavascriptInterface;

import java.util.ArrayList;

public class Pixel10Bridge {
    private final Activity activity;
    private final View rootView;

    public Pixel10Bridge(Activity activity, View rootView) {
        this.activity = activity;
        this.rootView = rootView;
    }

    @JavascriptInterface
    public String getDeviceInfoJson() {
        boolean notifEnabled = isNotificationServiceEnabled();
        boolean smsGranted = activity.checkSelfPermission(Manifest.permission.SEND_SMS)
                == PackageManager.PERMISSION_GRANTED;

        return "{"
                + "\"model\":\"" + safeJson(Build.MODEL) + "\","
                + "\"device\":\"" + safeJson(Build.DEVICE) + "\","
                + "\"manufacturer\":\"" + safeJson(Build.MANUFACTURER) + "\","
                + "\"release\":\"" + safeJson(Build.VERSION.RELEASE) + "\","
                + "\"sdkInt\":" + Build.VERSION.SDK_INT + ","
                + "\"carrier\":\"Google Fi\","
                + "\"isNotificationListenerEnabled\":" + notifEnabled + ","
                + "\"hasSmsPermission\":" + smsGranted
                + "}";
    }

    @JavascriptInterface
    public boolean sendDirectSms(String phoneNumber, String message) {
        if (phoneNumber == null || phoneNumber.trim().isEmpty()) {
            return false;
        }
        try {
            if (activity.checkSelfPermission(Manifest.permission.SEND_SMS)
                    != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(new String[]{Manifest.permission.SEND_SMS}, 2001);
                return false;
            }
            SmsManager smsManager = activity.getSystemService(SmsManager.class);
            if (smsManager == null) {
                smsManager = SmsManager.getDefault();
            }
            ArrayList<String> parts = smsManager.divideMessage(message);
            smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public void openSmsComposer(String phoneNumber, String message) {
        try {
            Intent intent = new Intent(Intent.ACTION_SENDTO);
            intent.setData(Uri.parse("smsto:" + Uri.encode(phoneNumber)));
            intent.putExtra("sms_body", message);
            activity.startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void showNativeNotification(String title, String body) {
        try {
            NotificationManager manager = activity.getSystemService(NotificationManager.class);
            if (manager == null) return;

            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(activity, MainActivity.CHANNEL_ID);
            } else {
                builder = new Notification.Builder(activity);
            }

            Notification notification = builder
                    .setContentTitle(title != null ? title : "Phillips WhatsApp Event Alert")
                    .setContentText(body != null ? body : "New WhatsApp event detected")
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setAutoCancel(true)
                    .build();

            manager.notify((int) (System.currentTimeMillis() & 0xFFFFFFF), notification);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void openCalendarEvent(
            String title,
            String location,
            String description,
            long startMillis,
            long endMillis
    ) {
        try {
            Intent intent = new Intent(Intent.ACTION_INSERT)
                    .setData(CalendarContract.Events.CONTENT_URI)
                    .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMillis)
                    .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMillis)
                    .putExtra(CalendarContract.Events.TITLE, title)
                    .putExtra(CalendarContract.Events.EVENT_LOCATION, location)
                    .putExtra(CalendarContract.Events.DESCRIPTION, description);
            activity.startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void openNotificationListenerSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            activity.startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void triggerHaptic(String type) {
        if (rootView == null) return;
        rootView.post(new Runnable() {
            @Override
            public void run() {
                try {
                    rootView.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                } catch (Exception ignored) {
                }
            }
        });
    }

    private boolean isNotificationServiceEnabled() {
        try {
            String flat = Settings.Secure.getString(
                    activity.getContentResolver(),
                    "enabled_notification_listeners"
            );
            return flat != null && flat.contains(activity.getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    private static String safeJson(String input) {
        if (input == null) return "";
        return input.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
