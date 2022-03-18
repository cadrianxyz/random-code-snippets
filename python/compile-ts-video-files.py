# SCRIPT USED TO COMPILE ".ts" FILES
import glob
import os
import threading

cwd = os.getcwd()

FOLDER_LIST = [
    "compile .ts files in this folder_name"
]

def compile(folder):
    filesList = glob.glob(f"{folder}/*.ts")
    filenamesList = [os.path.basename(x) for x in filesList]
    filenamesList = sorted(filenamesList, key = lambda x : int(x.split(".")[0]))

    textFile = open(f"{folder}/compiled.txt", 'a')
    for filename in filenamesList:
        textFile.write(f"file '{filename}'\n")
    textFile.close()
    # os.system(f"cat {folder}/{idx}*.ts >> temp/{idx}-{folder}.ts")
    # os.system(f"cat temp/*-{folder}.ts >> {folder}.ts")

    os.system(f"ffmpeg -f concat -i {folder}/compiled.txt -c copy converted/{folder}.ts")
    print(f"** COMPLETED COMBINING FILE: '{folder}'.ts")


for folder in FOLDER_LIST:
    th = threading.Thread(target=compile, args=(folder,))
    th.start()

print("*** COMPLETED COMPILING AND COMPRESSING ALL FILES!")