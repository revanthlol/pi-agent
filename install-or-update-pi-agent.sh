#!/bin/bash
# DirectPrint Pi Agent - Universal Interactive Setup
# Supports: Arch Linux, Ubuntu, Debian, Raspberry Pi OS

set -e

VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Emoji (with fallbacks for non-Unicode terminals)
CHECK="${GREEN}✓${NC}"
CROSS="${RED}✗${NC}"
ARROW="${BLUE}→${NC}"
STAR="${YELLOW}★${NC}"

# Print functions
print_header() {
    echo ""
    echo -e "${PURPLE}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║${WHITE}  DirectPrint Pi Agent Setup v${VERSION}         ${PURPLE}║${NC}"
    echo -e "${PURPLE}║${WHITE}  Universal Installer for All Linux Distros    ${PURPLE}║${NC}"
    echo -e "${PURPLE}╚════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${CYAN}═══════════════ $1 ═══════════════${NC}"
    echo ""
}

print_success() {
    echo -e "${CHECK} $1"
}

print_error() {
    echo -e "${CROSS} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC}  $1"
}

print_step() {
    echo -e "${ARROW} $1"
}

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
        OS_NAME=$NAME
    elif [ -f /etc/arch-release ]; then
        OS="arch"
        OS_NAME="Arch Linux"
    else
        OS="unknown"
        OS_NAME="Unknown"
    fi
    
    # Detect package manager
    if command -v pacman &> /dev/null; then
        PKG_MANAGER="pacman"
        INSTALL_CMD="sudo pacman -S --noconfirm"
        UPDATE_CMD="sudo pacman -Sy"
    elif command -v apt-get &> /dev/null; then
        PKG_MANAGER="apt"
        INSTALL_CMD="sudo apt-get install -y"
        UPDATE_CMD="sudo apt-get update"
    elif command -v dnf &> /dev/null; then
        PKG_MANAGER="dnf"
        INSTALL_CMD="sudo dnf install -y"
        UPDATE_CMD="sudo dnf check-update"
    elif command -v yum &> /dev/null; then
        PKG_MANAGER="yum"
        INSTALL_CMD="sudo yum install -y"
        UPDATE_CMD="sudo yum check-update"
    else
        PKG_MANAGER="unknown"
    fi
}

# Check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        print_warning "Please don't run as root. Run as normal user with sudo access."
        exit 1
    fi
}

# Check sudo access
check_sudo() {
    if ! sudo -n true 2>/dev/null; then
        print_info "This script requires sudo access."
        sudo -v
    fi
}

# Display system info
show_system_info() {
    print_section "System Information"
    echo -e "${WHITE}OS:${NC}              $OS_NAME"
    echo -e "${WHITE}Distribution:${NC}    $OS"
    echo -e "${WHITE}Package Manager:${NC} $PKG_MANAGER"
    echo -e "${WHITE}Architecture:${NC}    $(uname -m)"
    echo -e "${WHITE}Kernel:${NC}          $(uname -r)"
    echo ""
}

# Confirm installation
confirm_install() {
    print_section "Installation Overview"
    echo "This script will install:"
    echo ""
    echo "  1. Node.js (v18.x)"
    echo "  2. CUPS (printing system)"
    echo "  3. LibreOffice (document conversion)"
    echo "  4. ImageMagick (image conversion)"
    echo "  5. DirectPrint Pi Agent"
    echo "  6. System services (auto-start)"
    echo ""
    
    read -p "Continue with installation? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Installation cancelled."
        exit 0
    fi
}

# Update system
update_system() {
    print_section "Updating System"
    print_step "Running system update..."
    
    if [ "$PKG_MANAGER" = "pacman" ]; then
        $UPDATE_CMD
    else
        $UPDATE_CMD
    fi
    
    print_success "System updated"
}

# Install Node.js
install_nodejs() {
    print_section "Installing Node.js"
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_info "Node.js already installed: $NODE_VERSION"
        
        # Check if version is acceptable (v16+)
        MAJOR_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$MAJOR_VERSION" -ge 16 ]; then
            print_success "Node.js version is acceptable"
            return 0
        else
            print_warning "Node.js version too old, upgrading..."
        fi
    fi
    
    print_step "Installing Node.js 18.x..."
    
    if [ "$PKG_MANAGER" = "pacman" ]; then
        # Arch Linux
        $INSTALL_CMD nodejs npm git
    elif [ "$PKG_MANAGER" = "apt" ]; then
        # Ubuntu/Debian/Raspberry Pi OS
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        $INSTALL_CMD nodejs git
    elif [ "$PKG_MANAGER" = "dnf" ] || [ "$PKG_MANAGER" = "yum" ]; then
        # Fedora/RHEL
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        $INSTALL_CMD nodejs git
    fi
    
    # Verify installation
    if command -v node &> /dev/null; then
        print_success "Node.js installed: $(node --version)"
    else
        print_error "Node.js installation failed"
        exit 1
    fi
}
# Install CUPS
install_cups() {
    print_section "Installing CUPS (Printing System)"
    
    if command -v lpstat &> /dev/null; then
        print_info "CUPS already installed"
        print_success "CUPS version: $(lpstat -v 2>&1 | head -n1 || echo 'installed')"
        return 0
    fi
    
    print_step "Installing CUPS..."
    
    if [ "$PKG_MANAGER" = "pacman" ]; then
        $INSTALL_CMD cups cups-pdf
    elif [ "$PKG_MANAGER" = "apt" ]; then
        $INSTALL_CMD cups cups-client
    else
        # DNF / YUM
        $INSTALL_CMD cups cups-client
    fi
    
    # Start CUPS service
    print_step "Starting CUPS service..."
    sudo systemctl start cups
    sudo systemctl enable cups
    
    # Add user to lpadmin group (Note: some distros use 'sys' or 'wheel', but lpadmin is standard)
    print_step "Adding user to lpadmin group..."
    sudo usermod -a -G lpadmin $USER || print_warning "Could not add to lpadmin group. You may need to do this manually."
    
    print_success "CUPS installed and running"
}

# Install LibreOffice
install_libreoffice() {
    print_section "Installing LibreOffice (Document Conversion)"
    
    if command -v libreoffice &> /dev/null; then
        print_info "LibreOffice already installed"
        print_success "LibreOffice version: $(libreoffice --version 2>&1 | head -n1)"
        return 0
    fi
    
    print_step "Installing LibreOffice (headless)..."
    
    if [ "$PKG_MANAGER" = "pacman" ]; then
        $INSTALL_CMD libreoffice-fresh
    elif [ "$PKG_MANAGER" = "apt" ]; then
        $INSTALL_CMD libreoffice-writer --no-install-recommends
    else
        # DNF / YUM don't accept apt flags
        $INSTALL_CMD libreoffice-writer
    fi
    
    # Verify installation
    if command -v libreoffice &> /dev/null; then
        print_success "LibreOffice installed: $(libreoffice --version | head -n1)"
    else
        print_error "LibreOffice installation failed"
        exit 1
    fi
}

# Install ImageMagick
install_image_tools() {
    print_section "Installing Image Processing Tools"
    
    # Check ImageMagick
    if command -v convert &> /dev/null; then
        print_info "ImageMagick already installed"
        print_success "ImageMagick version: $(convert --version | head -n1)"
    else
        print_step "Installing ImageMagick..."
        
        if [ "$PKG_MANAGER" = "pacman" ]; then
            $INSTALL_CMD imagemagick
        elif [ "$PKG_MANAGER" = "apt" ]; then
            $INSTALL_CMD imagemagick
        else
            # Fedora/RHEL
            $INSTALL_CMD imagemagick
        fi
        
        if command -v convert &> /dev/null; then
            print_success "ImageMagick installed"
        else
            print_error "ImageMagick installation failed"
            exit 1
        fi
    fi
}

# Setup Pi Agent
setup_pi_agent() {
    print_section "Setting Up Pi Agent"

    # Define installation directory
    INSTALL_DIR="$HOME/directprint-agent"
    
    # --- Helper function to generate .env ---
    generate_env_file() {
        print_step "Creating .env configuration..."
        echo ""
        echo -e "${WHITE}Configuration:${NC}"
        echo ""

        read -p "Backend URL -(leave blank for default) [https://justpri.duckdns.org]: " CLOUD_URL
        CLOUD_URL=${CLOUD_URL:-https://justpri.duckdns.org}

        read -p "Frontend URL -(leave blank for default) [https://qr-wifi-printer.vercel.app]: " FRONTEND_URL
        FRONTEND_URL=${FRONTEND_URL:-https://qr-wifi-printer.vercel.app}

        # Ask for a manual Kiosk ID, default to 'kiosk_1' if they just hit enter
        read -p "Enter a unique Kiosk ID for printer detection (e.g. kiosk_1): " KIOSK_ID
        KIOSK_ID=${KIOSK_ID:-kiosk_1}

        read -p "Printer name -(leave blank for auto-detect): " PRINTER_NAME
        PRINTER_NAME=${PRINTER_NAME:-auto}

        cat > .env << EOF
# Cloud Backend
CLOUD_URL=$CLOUD_URL

# Frontend URL for QR code
FRONTEND_URL=$FRONTEND_URL

# Kiosk Configuration
KIOSK_ID=$KIOSK_ID
PRINTER_NAME=$PRINTER_NAME

# Polling Configuration
POLL_INTERVAL=5000

# QR Server
QR_SERVER_PORT=3000
EOF

        print_success "Configuration saved to .env"
    }

# Check if already installed
if [ -d "$INSTALL_DIR" ]; then
    print_info "DirectPrint agent already installed at: $INSTALL_DIR"
    echo ""
    read -p "Update existing installation? (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_step "Updating pi-agent code..."
        cd "$INSTALL_DIR" || { print_error "Failed to cd into $INSTALL_DIR"; exit 1; }

        # Backup current .env
        if [ -f ".env" ]; then
            cp .env .env.backup
            print_info "Backed up .env file"
        fi

        # --- Smart Update Logic (pull or clone) ---
        if [ -d ".git" ]; then
            print_step "Git repo detected — pulling latest changes..."
            git pull origin main || {
                print_error "Git pull failed"
                exit 1
            }
        else
            print_step "No git repo found — cloning fresh copy..."

            TMP_DIR="$(mktemp -d)"
            git clone https://github.com/revanthlol/pi-agent.git "$TMP_DIR" || {
                print_error "Git clone failed"
                rm -rf "$TMP_DIR"
                exit 1
            }

            cp -rn "$TMP_DIR"/* . 2>/dev/null || true
            cp -rn "$TMP_DIR"/.* . 2>/dev/null || true
            rm -rf "$TMP_DIR"
        fi

        # Flatten the directory: move files from pi-agent/ to root
        if [ -d "pi-agent" ]; then
            print_info "Syncing files from subfolder to root..."

            cp -rn pi-agent/* . 2>/dev/null || true
            cp -rn pi-agent/.* . 2>/dev/null || true

            mv -f pi-agent/* . 2>/dev/null || true
            mv -f pi-agent/.* . 2>/dev/null || true

            rmdir pi-agent 2>/dev/null || true
        fi
        # ----------------------------------------

        # Restore .env
        if [ -f ".env.backup" ]; then
            mv .env.backup .env
            print_info "Restored .env file"
        fi

        # Update dependencies
        print_step "Updating dependencies..."
        npm install
        print_success "Pi agent updated!"

        # Ask about reconfiguration
        echo ""
        read -p "Reconfigure settings (.env file)? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_step "Reconfiguring..."
            rm -f .env
            generate_env_file
        fi

        PI_AGENT_DIR="$INSTALL_DIR"
        return 0
    else
        print_info "Skipping update, keeping existing installation."
        PI_AGENT_DIR="$INSTALL_DIR"
        return 0
    fi
fi

# ----- Fresh installation flow -----
print_step "Installing pi-agent..."

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR" || { print_error "Failed to cd into $INSTALL_DIR"; exit 1; }

print_step "Cloning repository..."
git clone https://github.com/revanthlol/pi-agent.git . || {
    print_error "Git clone failed"
    exit 1
}

# Flatten the directory: move files from pi-agent/ to root
if [ -d "pi-agent" ]; then
    print_info "Flattening pi-agent directory..."

    mv pi-agent/* .
    mv pi-agent/.* . 2>/dev/null || true
    rmdir pi-agent
fi

print_success "Pi agent downloaded"

# Install dependencies
print_step "Installing Node.js dependencies..."
npm install
print_success "Dependencies installed"

# Create .env file
if [ ! -f ".env" ]; then
    generate_env_file
else
    print_info ".env file already exists, skipping"
fi

PI_AGENT_DIR="$INSTALL_DIR"
print_success "Pi Agent setup complete"


# Create systemd service
create_systemd_service() {
    print_section "Creating System Services"
    
    print_step "Creating systemd service..."
    
    sudo tee /etc/systemd/system/directprint-agent.service > /dev/null <<EOF
[Unit]
Description=DirectPrint Pi Agent
After=network.target cups.service
Requires=cups.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$PI_AGENT_DIR
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

# Environment
Environment=NODE_ENV=production

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=directprint-agent

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    print_success "Service created"
    
    # Ask if user wants to enable auto-start
    echo ""
    read -p "Enable auto-start on boot? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo systemctl enable directprint-agent
        print_success "Auto-start enabled"
    fi
    
    # Ask if user wants to start now
    echo ""
    read -p "Start service now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo systemctl start directprint-agent
        sleep 2
        sudo systemctl status directprint-agent --no-pager
        print_success "Service started"
    fi
}

# Create QR server service (optional)
create_qr_service() {
    print_section "QR Display Service (Optional)"
    
    echo "The QR display service runs a web server showing the QR code."
    LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || echo "localhost")
    echo "You can access it at http://${LOCAL_IP}:3000"
    echo ""
    read -p "Install QR display service? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        return 0
    fi
    
    print_step "Creating QR service..."
    
    sudo tee /etc/systemd/system/directprint-qr.service > /dev/null <<EOF
[Unit]
Description=DirectPrint QR Display Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PI_AGENT_DIR
ExecStart=/usr/bin/node qr-server.js
Restart=always
RestartSec=10

# Environment
Environment=NODE_ENV=production
Environment=QR_SERVER_PORT=3000

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=directprint-qr

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable directprint-qr
    sudo systemctl start directprint-qr
    
    print_success "QR service created and started"
}

# Print completion message
show_completion() {
    print_section "Installation Complete!"
    
    echo -e "${GREEN}${CHECK}${NC} DirectPrint Pi Agent is ready!"
    echo ""
    echo -e "${WHITE}Next Steps:${NC}"
    echo ""
    echo "  1. ${ARROW} Check service status:"
    echo "     ${CYAN}sudo systemctl status directprint-agent${NC}"
    echo ""
    echo "  2. ${ARROW} View logs:"
    echo "     ${CYAN}sudo journalctl -u directprint-agent -f${NC}"
    echo ""
    echo "  3. ${ARROW} Restart service:"
    echo "     ${CYAN}sudo systemctl restart directprint-agent${NC}"
    echo ""
    echo "  4. ${ARROW} Restart QR service:"
    echo "     ${CYAN}sudo systemctl restart directprint-qr${NC}"
    echo ""
    echo "  5. ${ARROW} QR Code (if enabled):"
    LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
    echo "     ${CYAN}http://${LOCAL_IP}:3000${NC}"
    echo ""
    
    if [ "$PKG_MANAGER" = "apt" ]; then
        print_warning "You may need to log out and back in for group changes to take effect"
    fi
    
    echo ""
    echo -e "${PURPLE}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║${WHITE}  🎉 Setup Complete! Happy Printing! 🖨️         ${PURPLE}║${NC}"
    echo -e "${PURPLE}╚════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Main installation flow
main() {
    print_header
    
    check_root
    check_sudo
    detect_os
    show_system_info
    confirm_install
    
    update_system
    install_nodejs
    install_cups
    install_libreoffice
    install_image_tools
    setup_pi_agent
    create_systemd_service
    create_qr_service
    
    show_completion
}

# Error handling
trap 'echo -e "\n${RED}Error: Installation failed!${NC}\n"; exit 1' ERR

# Run main installation
main "$@"
