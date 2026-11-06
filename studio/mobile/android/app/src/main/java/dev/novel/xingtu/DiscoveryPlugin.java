package dev.novel.xingtu;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 找局域网里开着星图书房的电脑：往每个网卡的广播地址发一声 XINGTU-DISCOVER，
 * 电脑在 UDP 5211 端口上回一句 {"app":"xingtu","name":电脑名,"port":5210}。
 */
@CapacitorPlugin(name = "Discovery")
public class DiscoveryPlugin extends Plugin {
    private static final int PORT = 5211;
    private static final byte[] MSG = "XINGTU-DISCOVER".getBytes(StandardCharsets.UTF_8);

    @PluginMethod
    public void discover(PluginCall call) {
        final int timeout = call.getInt("timeout", 1500);
        new Thread(() -> {
            JSArray found = new JSArray();
            Set<String> seen = new HashSet<>();
            try (DatagramSocket socket = new DatagramSocket()) {
                socket.setBroadcast(true);
                socket.setSoTimeout(200);
                for (InetAddress a : broadcastAddresses()) {
                    try {
                        socket.send(new DatagramPacket(MSG, MSG.length, a, PORT));
                    } catch (Exception ignored) {
                    }
                }
                long end = System.currentTimeMillis() + timeout;
                byte[] buf = new byte[2048];
                while (System.currentTimeMillis() < end) {
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    try {
                        socket.receive(p);
                    } catch (SocketTimeoutException e) {
                        continue;
                    }
                    String ip = p.getAddress().getHostAddress();
                    if (!seen.add(ip)) continue;
                    try {
                        JSObject o = new JSObject(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
                        if (!"xingtu".equals(o.getString("app"))) continue;
                        o.put("ip", ip);
                        found.put(o);
                    } catch (Exception ignored) {
                    }
                }
            } catch (Exception e) {
                call.reject("广播失败：" + e.getMessage());
                return;
            }
            JSObject ret = new JSObject();
            ret.put("found", found);
            call.resolve(ret);
        }).start();
    }

    private static List<InetAddress> broadcastAddresses() {
        List<InetAddress> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getBroadcast() != null) out.add(ia.getBroadcast());
                }
            }
        } catch (Exception ignored) {
        }
        try {
            out.add(InetAddress.getByName("255.255.255.255"));
        } catch (Exception ignored) {
        }
        return out;
    }
}
