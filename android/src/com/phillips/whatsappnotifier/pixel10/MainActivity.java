package com.phillips.whatsappnotifier.pixel10;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;

public class MainActivity extends Activity {
    public static final String CHANNEL_ID = "phillips_pixel10_whatsapp_events";
    private static final int FILE_CHOOSER_RESULT_CODE = 1001;

    private static MainActivity currentInstance;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingSharedText = null;
    private String pendingSharedTitle = null;
    private boolean pageLoaded = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        currentInstance = this;

        configurePixel10Display();
        createNotificationChannel();

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.addJavascriptInterface(new Pixel10Bridge(this, webView), "Pixel10Bridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageLoaded = true;
                flushPendingSharedChat();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_RESULT_CODE);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(webView);
        handleIncomingIntent(getIntent());
        webView.loadUrl("file:///android_asset/public/index.html");
    }

    private void configurePixel10Display() {
        try {
            Window window = getWindow();
            if (window != null) {
                WindowManager.LayoutParams params = window.getAttributes();
                // Request 120Hz Smooth Display on Google Pixel 10 Actua OLED panel
                params.preferredRefreshRate = 120.0f;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    params.layoutInDisplayCutoutMode =
                            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                }
                window.setAttributes(params);
            }
        } catch (Exception ignored) {
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Phillips WhatsApp Event Alerts (Pixel 10)",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Alerts when an upcoming event is detected in your WhatsApp chats.");
            channel.enableVibration(true);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
        if (pageLoaded) {
            flushPendingSharedChat();
        }
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (Intent.ACTION_SEND.equals(action) && type != null && type.startsWith("text/")) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (sharedText == null) {
                Uri streamUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (streamUri != null) {
                    sharedText = readUriText(streamUri);
                }
            }
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                pendingSharedText = sharedText;
                pendingSharedTitle = subject != null ? subject : "Shared from Pixel 10 WhatsApp";
            }
        }
    }

    private String readUriText(Uri uri) {
        try {
            InputStream is = getContentResolver().openInputStream(uri);
            if (is == null) return null;
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private void flushPendingSharedChat() {
        if (pendingSharedText == null || webView == null) return;
        final String escapedText = escapeJsString(pendingSharedText);
        final String escapedTitle = escapeJsString(
                pendingSharedTitle != null ? pendingSharedTitle : "Pixel 10 WhatsApp Export"
        );
        pendingSharedText = null;
        pendingSharedTitle = null;

        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript(
                        "if(window.onPixel10SharedChatText){window.onPixel10SharedChatText('"
                                + escapedText + "','" + escapedTitle + "');}",
                        null
                );
            }
        });
    }

    public static void deliverWhatsAppNotification(
            final String chatName,
            final String sender,
            final String text
    ) {
        final MainActivity activity = currentInstance;
        if (activity == null || activity.webView == null) return;
        final String jsChat = escapeJsString(chatName);
        final String jsSender = escapeJsString(sender);
        final String jsText = escapeJsString(text);

        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.webView.evaluateJavascript(
                        "if(window.onPixel10WhatsAppNotification){window.onPixel10WhatsAppNotification({"
                                + "chatName:'" + jsChat + "',"
                                + "sender:'" + jsSender + "',"
                                + "text:'" + jsText + "'"
                                + "});}",
                        null
                );
            }
        });
    }

    private static String escapeJsString(String raw) {
        if (raw == null) return "";
        return raw
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\r", "")
                .replace("\n", "\\n");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (filePathCallback == null) return;
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (currentInstance == this) {
            currentInstance = null;
        }
        super.onDestroy();
    }
}
