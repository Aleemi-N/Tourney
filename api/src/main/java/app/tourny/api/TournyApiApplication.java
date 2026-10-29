package app.tourny.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TournyApiApplication {

	public static void main(String[] args) {
		// The API always runs in UTC: the database refuses some legacy zone names a developer's machine may report (Asia/Calcutta).
		java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("UTC"));
		SpringApplication.run(TournyApiApplication.class, args);
	}

}
