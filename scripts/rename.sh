#!/bin/bash

# Recursive function to rename files and directories
rename_dyad_to_dyad() {
    for item in "$1"/*; do
        if [[ -e "$item" ]]; then
            # Get the base name of the item
            base_name=$(basename "$item")
            
            # Check if the name contains "dyad"
            if [[ "$base_name" == *"dyad"* ]]; then
                # Create the new name by replacing "dyad" with "dyad"
                new_name="${base_name//dyad/dyad}"
                
                # Rename the item
                mv "$item" "$(dirname "$item")/$new_name"
                echo "Renamed: $item -> $(dirname "$item")/$new_name"
            fi
            
            # If it's a directory, recurse into it
            if [[ -d "$item" ]]; then
                rename_dyad_to_dyad "$item"
            fi
        fi
    done
}

# Start the renaming process from the current directory
rename_dyad_to_dyad "."

echo "Renaming process completed."
