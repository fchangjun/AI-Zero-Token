import { ConfigService } from "./services/config-service.js";
import { AuthService } from "./services/auth-service.js";
import { ChatService } from "./services/chat-service.js";
import { ImageService } from "./services/image-service.js";
import { ModelService } from "./services/model-service.js";
import { VersionService } from "./services/version-service.js";

export function createGatewayContext() {
  const configService = new ConfigService();
  const authService = new AuthService(configService);
  const modelService = new ModelService(configService);
  const versionService = new VersionService();
  const chatService = new ChatService({
    authService,
    modelService,
  });
  const imageService = new ImageService({
    authService,
    configService,
  });

  return {
    configService,
    authService,
    modelService,
    versionService,
    chatService,
    imageService,
  };
}
