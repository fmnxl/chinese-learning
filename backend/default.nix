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

      python = pkgsMain.python312;

      pythonSet =
        (pkgsMain.callPackage pyproject-nix.build.packages {
          inherit python;
        }).overrideScope (
          pkgsMain.lib.composeManyExtensions [
            pyproject-build-systems.overlays.default
            overlay
          ]
        );

      # Use standard (non-editable) virtualenv for dev
      virtualenv = pythonSet.mkVirtualEnv "chinese-backend-dev-env" workspace.deps.all;

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
          export PYTHONPATH="${./.}:$PYTHONPATH"
          echo "🐍 Chinese Backend Dev Environment"
          echo "Python $(python --version)"
          echo "Run 'uvicorn app.main:app --reload --host 127.0.0.1 --port 8100'"
        '';
      };

      uvPackage = pythonSet.mkVirtualEnv "chinese-backend-env" workspace.deps.default;
    in {inherit uvDevShell uvPackage;}
    else {};

in {
  devShell = uvEnv.uvDevShell or null;
  package = uvEnv.uvPackage or null;
}
