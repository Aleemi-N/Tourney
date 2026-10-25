FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q -DskipTests package && cp target/tourny-api-*.jar /app.jar

FROM eclipse-temurin:21-jre
# Postgres rejects the legacy zone names some JVMs report, so run in UTC.
ENV JAVA_TOOL_OPTIONS=-Duser.timezone=UTC
RUN useradd --system --create-home tourny && mkdir /data && chown tourny /data
USER tourny
COPY --from=build /app.jar /app.jar
ENV TOURNY_STORAGE_ROOT=/data/storage
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
