package ng.credline.payments;

import ng.credline.CredlineProperties;
import ng.credline.credit.CreditBureau;
import ng.credline.credit.SandboxBureau;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
class PaymentsConfig {

    @Bean
    @ConditionalOnMissingBean
    PaymentGateway paymentGateway(CredlineProperties props) {
        return props.payments().sandbox() ? new SandboxGateway(props) : new PaystackGateway(props, RestClient.builder());
    }

    @Bean
    @ConditionalOnMissingBean
    CreditBureau creditBureau() {
        return new SandboxBureau();
    }
}
