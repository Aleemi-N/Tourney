package app.tourny.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TournyApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(TournyApiApplication.class, args);
	}

}
