package ng.credline.payments;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.zip.CRC32;
import ng.credline.CredlineProperties;

public class SandboxGateway implements PaymentGateway {

    public enum Behaviour { RELIABLE, LATE, DECLINED }

    public record TestCard(String id, String number, String brand, String label, Behaviour behaviour, String last4, String bank) {}

    public static final List<TestCard> CARDS = List.of(
            new TestCard("reliable", "4084 0840 8408 4081", "visa", "Always goes through", Behaviour.RELIABLE, "4081", "Guaranty Trust Bank"),
            new TestCard("late", "5060 6666 6666 6666 666", "verve", "Often short on the due date", Behaviour.LATE, "6666", "Access Bank"),
            new TestCard("declined", "5078 5078 5078 5078 12", "verve", "Insufficient funds", Behaviour.DECLINED, "5012", "First Bank"));

    private final String publicUrl;

    public SandboxGateway(CredlineProperties props) {
        this.publicUrl = props.payments().publicUrl();
    }

    public static Card issue(TestCard card) {
        String code = "AUTH_sbx_" + card.behaviour().name().toLowerCase() + "_" + UUID.randomUUID().toString().substring(0, 8);
        return new Card(code, card.brand(), card.last4(), 12, 2030, card.bank());
    }

    @Override
    public String name() {
        return "sandbox";
    }

    @Override
    public String startCardAuthorization(String reference, String email, long amount) {
        return publicUrl + "/checkout/" + reference;
    }

    @Override
    public Result charge(Card card, String email, long amount, String reference) {
        String code = card.authorizationCode();
        if (code.contains("_declined_")) {
            return Result.failed("Insufficient funds");
        }
        if (code.contains("_late_") && reference.startsWith("DBT-") && bucket(reference) < 60) {
            return Result.failed("Insufficient funds");
        }
        return Result.success();
    }

    @Override
    public Result transfer(String reference, long amount, String bankCode, String accountNumber, String accountName) {
        if (accountNumber.endsWith("0000")) {
            return Result.failed("Could not resolve account");
        }
        return Result.success();
    }

    private static int bucket(String reference) {
        CRC32 crc = new CRC32();
        crc.update(reference.getBytes(StandardCharsets.UTF_8));
        return (int) (crc.getValue() % 100);
    }
}
