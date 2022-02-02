import glob
import os

cwd = os.getcwd()
print(f"combining mp3 files in '{cwd}'")

for i in range(0, 67):
    # set the custom output name
    filenamesList = glob.glob(f"{i}*")
    outputName = filenamesList[0]
    outputName = outputName.split("-")[1]
    outputName = outputName.split(".")[0].lower()

    # set the custom file name
    for _ in range(0, 3):
        if outputName[-1].isdigit():
            outputName = outputName[0:-1]
    os.system(f"cat {i}*.mp3 >> {i}-{outputName}.mp3")