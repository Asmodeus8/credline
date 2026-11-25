FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src src
RUN mvn -B -q package -DskipTests && cp target/credline-api-*.jar /app.jar

FROM eclipse-temurin:25-jre-alpine
RUN addgroup -S -g 10001 credline && adduser -S -u 10001 -G credline credline
COPY --from=build /app.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
