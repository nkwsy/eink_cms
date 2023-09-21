#create systemd service
import os
import argparse

def generate_service_file(service_name, description, username):
    # Get the current working directory
    current_directory = os.path.dirname(os.path.abspath(__file__))

    # Virtual environment path (customize this if your venv is located elsewhere)
    venv_path = os.path.join(current_directory, "venv")

    # Create the systemd service content
    service_content = f"""[Unit]
Description={description}
After=network-online.target

[Service]
ExecStart={venv_path}/bin/gunicorn -w 4 -b 0.0.0.0 'eink_gen:create_app()'
Restart=always
User={username}
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
    """

    # Write the service file (this will write it in the current directory; you'll need to move it manually)
    with open(f"{service_name}.service", "w") as f:
        f.write(service_content)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate systemd service file.")

    parser.add_argument("--name", required=True, help="Service name")
    parser.add_argument("--description", default="My Python service", help="Service description")
    parser.add_argument("--username", required=True, help="Username to run the service")

    args = parser.parse_args()

    generate_service_file(args.name, args.description, args.username)

    print(f"Service file {args.name}.service generated.")
    print("Next steps:")
    print(f"1. Move the generated {args.name}.service file to /etc/systemd/system/")
    print("   Command: sudo mv {args.name}.service /etc/systemd/system/")
    print("2. Reload the systemctl daemon.")
    print("   Command: sudo systemctl daemon-reload")
    print(f"3. Enable the {args.name} service to start on boot.")
    print(f"   Command: sudo systemctl enable {args.name}")
    print(f"4. Start the {args.name} service.")
    print(f"   Command: sudo systemctl start {args.name}")
    print("5. Optionally, check the status of the service.")
    print(f"   Command: sudo systemctl status {args.name}")
