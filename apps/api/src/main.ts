import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { AppModule } from "./app.module";

try {
  process.loadEnvFile("../../.env");
} catch {
  // production passes env directly
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle("AI Visibility Tracker").addBearerAuth().build(),
  );
  SwaggerModule.setup("api/docs", app, cleanupOpenApiDoc(doc));
  await app.listen(Number(process.env.PORT ?? 4000));
}
void bootstrap();
