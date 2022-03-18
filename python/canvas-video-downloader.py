# SCRIPT USED TO DOWNLOAD A VIDEO TCP STREAM OF ".ts" FILES
# use "compile-ts-video-files.py" to compile the downloaded ts files
# the script will create a folder in the same directory using the given `folder_name``
import requests
import os

LECTURE_LIST = [
    # ["folder_name", "link_part_1", "link_part_2"],
]
# the `link_part_1` and `link_part_2` parts are just the two different parts of the link that are separated by a "counter"
# normally, streams are done by downloading a bunch of ".ts" files that are consecutively numbered
# customize as necessary

cwd = os.getcwd()
print(cwd)

def get_url(number, folder, url1, url2):
    video = requests.get(f"{url1}{number}{url2}", stream=True)
    
    # print response
    print(f"{video} - {number}")

    # continue if response is ok
    if(not video.ok):
        return False

    # skip if already downloaded somehow
    if(os.path.exists(f"{folder}/{number}.ts")):
        return True

    # download the video stream
    with open(f"{folder}/{number}.ts", "wb") as f:
        for chunk in video.iter_content(chunk_size=1024): 
            if chunk: # filter out keep-alive new chunks
                f.write(chunk)

    return True


OPTIONAL_IDX_END = False # set to False if unused

for lecture in LECTURE_LIST:
    LECTURE_TITLE = lecture[0]
    idx = 1

    if not os.path.exists(LECTURE_TITLE):
        print(f"{LECTURE_TITLE} folder is not found, creating the folder.")
        os.makedirs(LECTURE_TITLE)

    print(f"## STARTING DOWNLOAD FOR: '{LECTURE_TITLE}'")

    while(True):
        result = get_url(idx, LECTURE_TITLE, lecture[1], lecture[2])

        if(result == False or idx == OPTIONAL_IDX_END):
            print("FOUND BROKEN LINK")
            break

        idx += 1

    print(f"** COMPLETED DOWNLOADING STREAM FOR: '{LECTURE_TITLE}'")
    # os.system(f"cat {LECTURE_TITLE}/*.ts >> {LECTURE_TITLE}.ts")
    # print(f"** COMPLETED COMBINING FILE: '{LECTURE_TITLE}'.ts")