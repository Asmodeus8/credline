package ng.credline.credit;

public interface CreditBureau {

    String name();

    DecisionEngine.BureauReport pull(String bvn);
}
