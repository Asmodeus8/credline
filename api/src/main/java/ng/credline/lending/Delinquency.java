package ng.credline.lending;

public enum Delinquency {
    CURRENT(0, 0),
    DPD_1_30(1, 30),
    DPD_31_60(31, 60),
    DPD_61_90(61, 90),
    DPD_90_PLUS(91, Integer.MAX_VALUE);

    private final int from;
    private final int to;

    Delinquency(int from, int to) {
        this.from = from;
        this.to = to;
    }

    public static Delinquency of(int dpd) {
        for (Delinquency d : values()) {
            if (dpd >= d.from && dpd <= d.to) {
                return d;
            }
        }
        throw new IllegalArgumentException("negative dpd " + dpd);
    }

    public boolean worseThan(Delinquency other) {
        return ordinal() > other.ordinal();
    }
}
