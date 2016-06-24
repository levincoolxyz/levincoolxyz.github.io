#!/bin/bash
if type zenity >/dev/null && [ ! `echo $DISPLAY` == "" ] && [ "$1" == "" ]
  then
    CommitComment=$(zenity --entry --text "Care to comment?" --entry-text "generic new commit");
elif [ ! "$1" == "" ]; then
  CommitComment="$1"
else
  CommitComment="remote commit thru terminal; too lazy to type";
fi

git add --all
git commit -m "$CommitComment"
git push
