score = @(wt,rt) sum(wt.*rt)/sum(wt*10)*100;

% categories
% 欲 色 香 味 感 入 出
feng = [2 2 2 1 1 4 4];
unif = ones(1,7);
baked_beef_soup = [8 4 5 6.5 3 10 8];
chicken_veggie_with_rice = [9 6 5 (9+5)/2 5 10 9];

score(feng,baked_beef_soup)
score(unif,baked_beef_soup)
score(feng,chicken_veggie_with_rice)
score(unif,chicken_veggie_with_rice)