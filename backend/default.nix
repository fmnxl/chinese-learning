{
  pkgs,
  pkgsMain ? pkgs,
  uv2nix ? null,
  pyproject-nix ? null,
  pyproject-build-systems ? null,
}: let
  uvEnv =
    if uv2nix != null
    then let
      workspace = uv2nix.lib.workspace.loadWorkspace {workspaceRoot = ./.;};

      overlay = workspace.mkPyprojectOverlay {
        sourcePreference = "wheel";
      };

      editableOverlay = workspace.mkEditablePyprojectOverlay {
        root = "$REPO_ROOT";
      };

      python = pkgsMain.python312;

      pythonSet =
        (pkgsMain.callPackage pyproject-nix.build.packages {
          inherit python;
        }).overrideScope (
          pkgs.lib.composeManyExtensions [
            pyproject-build-systems.overlays.default
            overlay
          ]
        );

      virtualenv = (pythonSet.overrideScope editableOverlay).mkVirtualEnv "chinese-backend-dev-env" workspace.deps.all;

      uvDevShell = pkgsMain.mkShell {
        packages = [
          virtualenv
          pkgsMain.uv
          pkgsMain.ruff
        ];
        env = {
          UV_NO_SYNC = "1";
          UV_PYTHON = pythonSet.python.interpreter;
          UV_PYTHON_DOWNLOADS = "never";
        };
        shellHook = ''
          unset PYTHONPATH
          export REPO_ROOT=$(git rev-parse --show-toplevel)
        '';
      };

      uvPackage = pythonSet.mkVirtualEnv "chinese-backend-env" workspace.deps.default;
    in {inherit uvDevShell uvPackage;}
    else {};

in {
  devShell = uvEnv.uvDevShell or null;
  package = uvEnv.uvPackage or null;
}
