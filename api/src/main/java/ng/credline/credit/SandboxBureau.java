package ng.credline.credit;

public class SandboxBureau implements CreditBureau {

    @Override
    public String name() {
        return "sandbox";
    }

    @Override
    public DecisionEngine.BureauReport pull(String bvn) {
        int last = bvn.charAt(bvn.length() - 1) - '0';
        int prev = bvn.charAt(bvn.length() - 2) - '0';
        return switch (last) {
            case 0 -> new DecisionEngine.BureauReport(true, 520 + prev * 3, 3, 1, 4_500_000);
            case 1 -> new DecisionEngine.BureauReport(false, null, 0, 0, 0);
            case 2 -> new DecisionEngine.BureauReport(true, 550 + prev * 2, 2, 0, 2_000_000);
            case 3 -> new DecisionEngine.BureauReport(true, 590 + prev * 2, 1, 0, 1_500_000);
            case 4 -> new DecisionEngine.BureauReport(true, 610 + prev * 3, 5, 0, 6_000_000);
            default -> new DecisionEngine.BureauReport(true, 650 + (last - 5) * 25 + prev, last - 5, 0, (last - 5) * 1_000_000L);
        };
    }
}
