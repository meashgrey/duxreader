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
            # rfd loads libdbus dynamically for the desktop portal on Linux.
            DUXREADER_LIBRARY_PATH = pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux
              (pkgs.lib.makeLibraryPath [ pkgs.dbus ]);
            # Playwright's downloaded Linux binaries do not run directly on NixOS.
            PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux
              "${pkgs.chromium}/bin/chromium";
            packages = with pkgs; [ bun cargo rustc rustfmt clippy rust-analyzer git pkg-config ]
              ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.wayland ];
            shellHook = ''
              echo "Duxreader: bun install --frozen-lockfile, then bun run dev or bun run dev:firefox"
            '';
          };
        });
    };
}
