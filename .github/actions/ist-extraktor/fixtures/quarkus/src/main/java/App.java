// vgl. https://beispiel.example.org/doku
@RegisterRestClient(configKey = "geo-client") interface GeoClient {}
@RegisterRestClient(baseUri = "https://routen.partner-c.example.org") interface Ors {}
@RegisterRestClient(configKey = "ohne-property") interface Lose {}
class Manual {
    @ConfigProperty(name = "partner-d.base-url") String base;
    HttpClient c = HttpClient.newBuilder().build();
}
