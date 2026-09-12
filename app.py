import importlib.util
from pathlib import Path

path = Path(__file__).parent / "services" / "caption-cpu-server" / "app.py"
spec = importlib.util.spec_from_file_location("cpu_service", path)
if spec is None or spec.loader is None:
    raise RuntimeError("CPU service app could not be loaded")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
app = module.app
