# MineCraft — sources

Reference textures: © Mojang AB. All rights reserved.

The four unmodified PNG files come from the official
[Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples)
repository at commit `15701fa9c13923f12662984c32c124327e40e3d3`:

- [Diamond sword](https://github.com/Mojang/bedrock-samples/blob/15701fa9c13923f12662984c32c124327e40e3d3/resource_pack/textures/items/diamond_sword.png)
- [HUD icons](https://github.com/Mojang/bedrock-samples/blob/15701fa9c13923f12662984c32c124327e40e3d3/resource_pack/textures/gui/icons.png)
- [GUI sprites](https://github.com/Mojang/bedrock-samples/blob/15701fa9c13923f12662984c32c124327e40e3d3/resource_pack/textures/gui/gui.png)
- [Steve skin](https://github.com/Mojang/bedrock-samples/blob/15701fa9c13923f12662984c32c124327e40e3d3/resource_pack/textures/entity/steve.png)

Their upstream [license notice](https://github.com/Mojang/bedrock-samples/blob/15701fa9c13923f12662984c32c124327e40e3d3/LICENSE.md)
refers to the [Minecraft EULA](https://www.minecraft.net/en-us/eula).
These textures are not presented as project-authored or MIT-licensed artwork.
`provenance.json` records the upstream revision and SHA-256 of each local PNG.

Animation research:

- [Official first-person animations](https://github.com/Mojang/bedrock-samples/blob/15701fa9c13923f12662984c32c124327e40e3d3/resource_pack/animations/player_firstperson.animation.json)
- [Official player animation variables](https://github.com/Mojang/bedrock-samples/blob/15701fa9c13923f12662984c32c124327e40e3d3/resource_pack/entity/player.entity.json)
- [Microsoft render-controller documentation and hurt-color example](https://learn.microsoft.com/en-us/minecraft/creator/documents/animations/animationrendercontroller)

Project adaptations: the sword sprite is extruded into closed 3D geometry; a
Steve-skinned block arm holds it in a camera-overlay viewport. Published
first-person attack curves inform translation/rotation, with screen-directed
input and a normalized rotation factor. Person segmentation replaces an
in-game entity model for the red hurt overlay. The HUD combines native sprites
with a project-authored inventory panel.

This is a local camera interaction example, not the Minecraft game engine.
Different editions/resource packs have different visuals. Frame-for-frame
identity with a particular game build has not been verified.
