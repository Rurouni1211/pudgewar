export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    // load assets if needed
  }

  create() {
    this.scene.start("TitleScene"); // ✅ Go directly to GameScene
  }
}
