import java.net.http.HttpClient;
import org.eclipse.microprofile.config.inject.ConfigProperty;

public class App {
    @ConfigProperty(name = "partner-d.base-url")
    String partnerDBaseUrl;

    static final HttpClient CLIENT = HttpClient.newBuilder().build();
    static final String ROUTEN = "https://routen.partner-c.example.org/v2/directions";
}
