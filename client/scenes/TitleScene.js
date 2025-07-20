export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: "TitleScene" });
  }

  preload() {
    // Load background image for title screen
    this.load.image("titleBg", "assets/background.jpg");
  }

  create() {
    // Display the background
    this.add
      .image(0, 0, "titleBg")
      .setOrigin(0, 0)
      .setDisplaySize(this.game.config.width, this.game.config.height);

    // Game Title Text
    this.add
      .text(
        this.game.config.width / 2,
        this.game.config.height / 2 - 50,
        "Pudge War",
        {
          font: "40px Arial",
          fill: "#e45f5fff",
        }
      )
      .setOrigin(0.5);

    // Click Prompt Text
    this.add
      .text(
        this.game.config.width / 2,
        this.game.config.height / 2 + 20,
        "Click to Start",
        {
          font: "24px Arial",
          fill: "#ec5050ff",
        }
      )
      .setOrigin(0.5);

    // On click, start LobbyScene
    this.input.once("pointerdown", () => {
      this.scene.start("LobbyScene");
    });
  }
}
