{
  description = "Chinese Radicals Learning App - SvelteKit";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs = inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];

      perSystem = { pkgs, ... }: {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_20  # includes npm
          ];

          shellHook = ''
            echo "🇨🇳 Chinese Radicals Learning App - Dev Environment"
            echo "Node.js $(node --version) | npm $(npm --version)"
          '';
        };
      };
    };
}
