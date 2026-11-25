package ng.credline.common;

import java.security.SecureRandom;

public final class References {

    private static final char[] ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private References() {}

    public static String next(String prefix) {
        char[] out = new char[8];
        for (int i = 0; i < out.length; i++) {
            out[i] = ALPHABET[RANDOM.nextInt(ALPHABET.length)];
        }
        return prefix + "-" + new String(out);
    }
}
