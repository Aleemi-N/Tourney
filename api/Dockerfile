FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
# The wrapper must be executable however the repository was checked out (Windows and some servers drop the flag).
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q -DskipTests package && cp target/tourny-api-*.jar /app.jar

FROM eclipse-temurin:21-jre
# Postgres rejects the legacy zone names some JVMs report, so run in UTC.
ENV JAVA_TOOL_OPTIONS=-Duser.timezone=UTC
# The images folder must belong to the API's user: a new Docker volume takes the owner of the folder it is mounted on.
RUN useradd --system --create-home tourny && mkdir -p /data/storage && chown -R tourny /data
USER tourny
COPY --from=build /app.jar /app.jar
# For the move from Supabase (see deploy/cutover-load.sh).
COPY copy-images.sh /app/copy-images.sh
ENV TOURNY_STORAGE_ROOT=/data/storage
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
