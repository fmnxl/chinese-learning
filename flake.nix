{
  description = "Chinese Learning App - SvelteKit Frontend + Litestar Backend";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    
    # uv2nix for Python backend
    uv2nix.url = "github:pyproject-nix/uv2nix";
    uv2nix.inputs.nixpkgs.follows = "nixpkgs";
    pyproject-nix.url = "github:pyproject-nix/pyproject.nix";
    pyproject-nix.inputs.nixpkgs.follows = "nixpkgs";
    pyproject-build-systems.url = "github:pyproject-nix/build-system-pkgs";
    pyproject-build-systems.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs@{ flake-parts, nixpkgs, uv2nix, pyproject-nix, pyproject-build-systems, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];

      perSystem = { pkgs, system, ... }: let
        backend = import ./backend {
          inherit pkgs uv2nix pyproject-nix pyproject-build-systems;
          pkgsMain = pkgs;
        };
      in {
        # Frontend dev shell (Node.js for SvelteKit)
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_20  # includes npm
          ];

          shellHook = ''
            echo "🇨🇳 Chinese Learning App - Frontend Dev Environment"
            echo "Node.js $(node --version) | npm $(npm --version)"
          '';
        };

        # Backend dev shell (Python with uv2nix)
        devShells.backend = backend.devShell;

        # Packages
        packages.backend = backend.package;
      };
    };
}

