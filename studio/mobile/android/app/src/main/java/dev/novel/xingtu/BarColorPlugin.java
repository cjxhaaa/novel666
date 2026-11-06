package dev.novel.xingtu;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 换底色时让状态栏、导航条跟着变：网页画不到系统栏后面，露出来的是窗口底色，
 * 所以把窗口底色（老系统上还有系统栏颜色）设成和网页一样，图标深浅跟着换。
 */
@CapacitorPlugin(name = "BarColor")
public class BarColorPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        final int color;
        try {
            color = Color.parseColor(call.getString("color", "#060913"));
        } catch (IllegalArgumentException e) {
            call.reject("颜色不对");
            return;
        }
        final boolean dark = call.getBoolean("dark", true);
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            View decor = w.getDecorView();
            decor.setBackgroundColor(color);
            if (Build.VERSION.SDK_INT < 35) {
                w.setStatusBarColor(color);
                w.setNavigationBarColor(color);
            }
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, decor);
            c.setAppearanceLightStatusBars(!dark);
            c.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }
}
