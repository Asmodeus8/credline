package ng.credline.payments;

public interface PaymentGateway {

    enum Status { SUCCESS, FAILED, PENDING }

    record Result(Status status, String reason) {
        public static Result success() {
            return new Result(Status.SUCCESS, null);
        }

        public static Result failed(String reason) {
            return new Result(Status.FAILED, reason);
        }

        public static Result pending() {
            return new Result(Status.PENDING, null);
        }
    }

    record Card(String authorizationCode, String cardType, String last4, int expMonth, int expYear, String bank) {}

    String name();

    String startCardAuthorization(String reference, String email, long amount);

    Result charge(Card card, String email, long amount, String reference);

    Result transfer(String reference, long amount, String bankCode, String accountNumber, String accountName);
}
