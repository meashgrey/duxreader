{
  description = "Duxreader browser extension and local theme bridge";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      eachSystem = nixpkgs.lib.genAttrs systems;
    in {
      devShells = eachSystem (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [ bun cargo rustc rustfmt clippy rust-analyzer git ];
            shellHook = ''
              echo "Duxreader: bun install --frozen-lockfile, then bun run dev or bun run dev:firefox"
            '';
          };
        });
    };
}
