import sys
import os

try:
    from rembg import remove
    from PIL import Image
except ImportError as e:
    print(f"ERROR: No se pudo importar las librerías necesarias. Detalle: {str(e)}")
    sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print("Uso: python remove_bg.py <input_path> <output_path>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"ERROR: El archivo de entrada no existe: {input_path}")
        sys.exit(1)

    try:
        input_image = Image.open(input_path)
        # Use rembg to remove the background automatically
        output_image = remove(input_image)
        output_image.save(output_path, "PNG")
        print("SUCCESS")
    except Exception as e:
        print(f"ERROR: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
