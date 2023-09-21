#create systemd service
#run with sudo python setup_service.py

import os
from systemd_service import Service

# Initialize SystemdService instance
service = Service()

# Get the path to the current directory (where your script is located)
current_directory = os.path.dirname(os.path.abspath(__file__))

# Assuming that the virtual environment is in the same directory
# Or adjust the path as per your setup
venv_path = os.path.join(current_directory, "venv")

# Populate basic service settings
service.name = "eink"
service.description = "eink service"

# Specify the gunicorn command and your application entry point
# Adjust the command according to your needs
service.exec_start = f"{venv_path}/bin/gunicorn -w 4 -b 0.0.0.0 'eink_gen:create_app()'"
service.restart = "always"
service.user = "debmin"
service.after = "network-online.target"
service.environment = {"PYTHONUNBUFFERED": "1"}

# Generate the service
service_path = service.generate_service_file()

# Copy the generated file to /etc/systemd/system
service.install()

# Reload the systemctl daemon to recognize your new service
service.reload()

# Enable and start your service
service.enable()
service.start()
