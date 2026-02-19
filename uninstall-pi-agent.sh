#!/bin/bash
# DirectPrint - Complete Uninstallation Script
# Removes all DirectPrint components but keeps system packages (Node.js, CUPS, etc.)

set -e

VERSION="1.0.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

print_header() {
  echo ""
  echo -e "${RED}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║${WHITE}  DirectPrint - Complete Uninstallation        ${RED}║${NC}"
  echo -e "${RED}║${WHITE}  Version ${VERSION}                                ${RED}║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_section() {
  echo ""
  echo -e "${CYAN}═══════════════ $1 ═══════════════${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC}  $1"
}

print_info() {
  echo -e "${CYAN}ℹ${NC}  $1"
}

print_step() {
  echo -e "${CYAN}→${NC} $1"
}

# Check if running as root
check_root() {
  if [ "$EUID" -eq 0 ]; then
    print_warning "Please don't run as root. Run as normal user with sudo access."
    exit 1
  fi
}

# Confirmation
confirm_uninstall() {
  print_section "What Will Be Removed"

  echo "This script will remove:"
  echo ""
  echo -e "  ${RED}✗${NC} DirectPrint pi-agent installation"
  echo -e "  ${RED}✗${NC} Git repository (~/directprint-agent or ~/qr-wifi-printer)"
  echo -e "  ${RED}✗${NC} Systemd services (directprint-agent, directprint-qr)"
  echo -e "  ${RED}✗${NC} Service configuration files"
  echo -e "  ${RED}✗${NC} Print queue files and temporary data"
  echo -e "  ${RED}✗${NC} Environment configuration (.env files)"
  echo ""
  echo -e "This script will ${GREEN}KEEP${NC}:"
  echo ""
  echo -e "  ${GREEN}✓${NC} Node.js"
  echo -e "  ${GREEN}✓${NC} Git"
  echo -e "  ${GREEN}✓${NC} CUPS (printing system)"
  echo -e "  ${GREEN}✓${NC} LibreOffice"
  echo -e "  ${GREEN}✓${NC} ImageMagick"
  echo -e "  ${GREEN}✓${NC} All system packages and dependencies"
  echo ""

  read -p "Continue with uninstallation? (y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Uninstallation cancelled."
    exit 0
  fi
}

# Stop services
stop_services() {
  print_section "Stopping Services"

  # Stop directprint-agent
  if systemctl is-active --quiet directprint-agent 2>/dev/null; then
    print_step "Stopping directprint-agent service..."
    sudo systemctl stop directprint-agent
    print_success "Stopped directprint-agent"
  else
    print_info "directprint-agent service not running"
  fi

  # Stop directprint-qr
  if systemctl is-active --quiet directprint-qr 2>/dev/null; then
    print_step "Stopping directprint-qr service..."
    sudo systemctl stop directprint-qr
    print_success "Stopped directprint-qr"
  else
    print_info "directprint-qr service not running"
  fi
}

# Disable services
disable_services() {
  print_section "Disabling Services"

  if systemctl is-enabled --quiet directprint-agent 2>/dev/null; then
    print_step "Disabling directprint-agent..."
    sudo systemctl disable directprint-agent
    print_success "Disabled directprint-agent"
  fi

  if systemctl is-enabled --quiet directprint-qr 2>/dev/null; then
    print_step "Disabling directprint-qr..."
    sudo systemctl disable directprint-qr
    print_success "Disabled directprint-qr"
  fi
}

# Remove service files
remove_service_files() {
  print_section "Removing Service Files"

  # Remove directprint-agent service
  if [ -f "/etc/systemd/system/directprint-agent.service" ]; then
    print_step "Removing directprint-agent.service..."
    sudo rm /etc/systemd/system/directprint-agent.service
    print_success "Removed /etc/systemd/system/directprint-agent.service"
  fi

  # Remove directprint-qr service
  if [ -f "/etc/systemd/system/directprint-qr.service" ]; then
    print_step "Removing directprint-qr.service..."
    sudo rm /etc/systemd/system/directprint-qr.service
    print_success "Removed /etc/systemd/system/directprint-qr.service"
  fi

  # Reload systemd
  print_step "Reloading systemd daemon..."
  sudo systemctl daemon-reload
  print_success "Systemd reloaded"
}

# Backup configuration
backup_config() {
  print_section "Backing Up Configuration"

  BACKUP_DIR="$HOME/directprint-backup-$(date +%Y%m%d-%H%M%S)"

  # Check for .env files in various locations
  local found_config=false

  for dir in "$HOME/directprint-agent" "$HOME/qr-wifi-printer/pi-agent" "/opt/directprint" "$HOME/directprint"; do
    if [ -f "$dir/.env" ]; then
      if [ "$found_config" = false ]; then
        mkdir -p "$BACKUP_DIR"
        found_config=true
      fi

      cp "$dir/.env" "$BACKUP_DIR/env-$(basename $dir).backup"
      print_info "Backed up .env from $dir"
    fi
  done

  if [ "$found_config" = true ]; then
    print_success "Configuration backed up to: $BACKUP_DIR"
    echo ""
    print_warning "Save this location if you want to restore settings later:"
    echo -e "          ${CYAN}$BACKUP_DIR${NC}"
    echo ""
  else
    print_info "No configuration files found to backup"
  fi
}

# Remove installation directories
remove_directories() {
  print_section "Removing Installation Directories"

  # List of possible installation directories
  local dirs=(
    "$HOME/directprint-agent"
    "$HOME/qr-wifi-printer"
    "$HOME/directprint"
    "/opt/directprint"
  )

  for dir in "${dirs[@]}"; do
    if [ -d "$dir" ]; then
      print_step "Removing $dir..."
      rm -rf "$dir"
      print_success "Removed $dir"
    fi
  done
}

# Clean up temporary files
cleanup_temp_files() {
  print_section "Cleaning Up Temporary Files"

  # Remove print queue files
  local temp_dirs=(
    "$HOME/directprint-agent/print-queue"
    "$HOME/qr-wifi-printer/pi-agent/print-queue"
    "/tmp/directprint*"
    "/tmp/print-queue*"
  )

  for dir in "${temp_dirs[@]}"; do
    if [ -d "$dir" ] || [ -f "$dir" ]; then
      print_step "Removing temporary files: $dir"
      rm -rf $dir
      print_success "Cleaned up temporary files"
    fi
  done
}

# Remove user from lpadmin group (optional)
remove_user_group() {
  print_section "User Group Cleanup (Optional)"

  if groups $USER | grep -q lpadmin; then
    echo ""
    print_warning "Your user is in the 'lpadmin' group (for CUPS printer management)."
    echo -e "This was likely added by the DirectPrint installer."
    echo ""
    read -p "Remove user from lpadmin group? (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
      sudo gpasswd -d $USER lpadmin
      echo -e "Removed $USER from lpadmin group"
      echo -e "You may need to log out and back in for this to take effect"
    else
      echo -e "Keeping user in lpadmin group"
    fi
  else
    echo -e "User not in lpadmin group, nothing to do"
  fi
}

# Check for orphaned processes
check_orphaned_processes() {
  echo ""
  echo -e "${YELLOW}Checking for Running Processes${NC}"

  # Check for any running node processes related to directprint
  local processes=$(ps aux | grep -i "directprint\|pi-agent\|qr-server" | grep -v grep | grep -v uninstall)

  if [ -n "$processes" ]; then
    print_warning "Found running DirectPrint processes:"
    echo "$processes"
    echo ""
    read -p "Kill these processes? (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
      pkill -f "directprint" || true
      pkill -f "pi-agent" || true
      pkill -f "qr-server" || true
      print_success "Killed DirectPrint processes"
    fi
  else
    print_info "No orphaned processes found"
  fi
}

# Remove old Sharp installation (if exists)
cleanup_old_dependencies() {
  print_section "Cleaning Up Old Dependencies"

  # Check for old installations that used Sharp
  for dir in "$HOME/directprint-agent" "$HOME/qr-wifi-printer/pi-agent"; do
    if [ -d "$dir/node_modules/sharp" ]; then
      print_info "Found old Sharp dependency in $dir"
      print_info "This will be removed with the directory"
    fi
  done

  print_info "npm packages will be removed with installation directories"
}

# Show final status
show_completion() {
  print_section "Uninstallation Complete"

  echo -e "${GREEN}✓${NC} DirectPrint has been completely removed!"
  echo ""
  echo "What was removed:"
  echo "  ${RED}✗${NC} All DirectPrint code and files"
  echo "  ${RED}✗${NC} Systemd services"
  echo "  ${RED}✗${NC} Temporary and cache files"
  echo ""
  echo "What was kept (system packages):"
  echo "  ${GREEN}✓${NC} Node.js"
  echo "  ${GREEN}✓${NC} CUPS"
  echo "  ${GREEN}✓${NC} LibreOffice"
  echo "  ${GREEN}✓${NC} All other system dependencies"
  echo ""

  # Check if backup was created
  if [ -d "$BACKUP_DIR" ]; then
    print_info "Configuration backup saved to:"
    echo "    ${CYAN}$BACKUP_DIR${NC}"
    echo ""
  fi

  print_warning "To reinstall DirectPrint, run: ./setup-pi-agent.sh"
  echo ""

  echo -e "${RED}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║${WHITE}  Uninstallation Complete! 👋                   ${RED}║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════╝${NC}"
  echo ""
}

# Optional: Remove system packages
inform_user() {
  echo "DirectPrint used these system packages:"
  echo ""
  echo "  • LibreOffice (document conversion)"
  echo "  • CUPS (printing system)"
  echo "  • ImageMagick (image processing)"
  echo ""
  echo "These packages are not removed , because they are used by the linux system and are still useful for you"
  echo ""
  echo "If you want to remove them, run:"
  echo "  sudo apt-get purge libreoffice* cups* imagemagick*"
  echo ""

}

# Main execution
main() {
  print_header

  check_root
  confirm_uninstall

  stop_services
  disable_services
  remove_service_files
  backup_config
  check_orphaned_processes
  cleanup_temp_files
  remove_directories
  cleanup_old_dependencies
  remove_user_group
  show_completion
  inform_user
  echo ""
  print_success "All done! System is clean."
  echo ""
}

# Error handling
trap 'echo -e "\n${RED}Error during uninstallation!${NC}\n"; exit 1' ERR

# Run uninstallation
main "$@"
