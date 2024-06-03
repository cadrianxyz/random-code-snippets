# example is for *.HEIC file types
prev_base=""

find . -type f -name "*.HEIC" | sort -r | while read file; do
    base_name=$(echo "$file" | sed -E 's/( \([0-9]+\))?\.HEIC$//')
   
    if [[ "$base_name" != "$prev_base" ]]; then
        prev_base="$base_name"
    else;
        echo "Deleting $file"
        rm "$file"
    fi
done
