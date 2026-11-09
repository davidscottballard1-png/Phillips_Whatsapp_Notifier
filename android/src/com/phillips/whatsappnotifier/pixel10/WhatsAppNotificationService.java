package com.phillips.whatsappnotifier.pixel10;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

public class WhatsAppNotificationService extends NotificationListenerService {
    private static final String WHATSAPP_PKG = "com.whatsapp";
    private static final String WHATSAPP_BUSINESS_PKG = "com.whatsapp.w4b";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        if (!WHATSAPP_PKG.equals(pkg) && !WHATSAPP_BUSINESS_PKG.equals(pkg)) {
            return;
        }

        Notification notification = sbn.getNotification();
        if (notification == null) return;

        // Ignore summary / ongoing notifications
        if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
            return;
        }

        Bundle extras = notification.extras;
        if (extras == null) return;

        CharSequence titleSeq = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence convTitleSeq = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE);
        CharSequence bigTextSeq = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence textSeq = extras.getCharSequence(Notification.EXTRA_TEXT);

        String messageText = bigTextSeq != null
                ? bigTextSeq.toString().trim()
                : (textSeq != null ? textSeq.toString().trim() : "");

        if (messageText.isEmpty() || messageText.length() < 8) {
            return;
        }

        // Prevent self-notification loops
        if (messageText.contains("[WhatsApp Event]")
                || messageText.contains("Phillips WhatsApp Event Alert")) {
            return;
        }

        String rawTitle = titleSeq != null ? titleSeq.toString().trim() : "WhatsApp Chat";
        String chatName = convTitleSeq != null && convTitleSeq.length() > 0
                ? convTitleSeq.toString().trim()
                : rawTitle;
        String sender = rawTitle;

        // In group notifications without EXTRA_CONVERSATION_TITLE, title is often "Group Name: Sender"
        if (convTitleSeq == null && rawTitle.contains(":")) {
            int colonIdx = rawTitle.indexOf(':');
            chatName = rawTitle.substring(0, colonIdx).trim();
            sender = rawTitle.substring(colonIdx + 1).trim();
        }

        MainActivity.deliverWhatsAppNotification(chatName, sender, messageText);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // No-op
    }
}
