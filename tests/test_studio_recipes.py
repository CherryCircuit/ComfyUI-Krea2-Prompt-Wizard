"""Tests for randomizer recipes: validation, storage and bundled data."""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from unittest import mock

from src.studio import presets as studio_presets
from src.studio import recipes as studio_recipes


class BundledRecipeTests(unittest.TestCase):
    def test_bundled_recipes_load(self):
        recipes = studio_recipes.load_recipes()
        bundled = [recipe for recipe in recipes if recipe["origin"] == "bundled"]
        self.assertGreaterEqual(len(bundled), 6)
        self.assertEqual(
            {recipe["id"] for recipe in bundled},
            {
                "recipe_cozy_fantasy",
                "recipe_neon_noir",
                "recipe_school_drama",
                "recipe_sunlit_nature",
                "recipe_grim_horror",
                "recipe_historical_drama",
            },
        )

    def test_every_pool_id_exists_in_the_right_slot(self):
        store = studio_presets.load_store()
        for recipe in studio_recipes.load_recipes():
            self.assertTrue(recipe["pools"], recipe["id"])
            for key, ids in recipe["pools"].items():
                category, group = key.split("|", 1)
                self.assertGreaterEqual(len(ids), 1, f"{recipe['id']} {key}")
                for preset_id in ids:
                    preset = store.get(preset_id)
                    self.assertIsNotNone(preset, f"{recipe['id']} -> {preset_id}")
                    self.assertEqual(preset.category, category, preset_id)
                    self.assertEqual(preset.exclusive_group, group, preset_id)
                    self.assertTrue(preset.enabled, preset_id)


class RecipeValidationTests(unittest.TestCase):
    def test_normalize_recipe_title_cases_and_defaults(self):
        recipe = studio_recipes.normalize_recipe(
            {
                "id": "recipe_test",
                "name": "MY COZY NIGHT",
                "pools": {"scene|scene": ["a", "b", "a"]},
            },
            "user",
        )
        self.assertEqual(recipe["name"], "My Cozy Night")
        self.assertTrue(recipe["randomize"])
        self.assertEqual(recipe["pools"], {"scene|scene": ["a", "b"]})
        self.assertEqual(recipe["origin"], "user")

    def test_normalize_recipe_rejects_junk(self):
        self.assertIsNone(studio_recipes.normalize_recipe("nope", "user"))
        self.assertIsNone(
            studio_recipes.normalize_recipe({"id": "bad id", "pools": {"a|b": ["x"]}}, "user")
        )
        self.assertIsNone(
            studio_recipes.normalize_recipe({"id": "recipe_empty", "pools": {}}, "user")
        )

    def test_normalize_recipe_cleans_picks(self):
        recipe = studio_recipes.normalize_recipe(
            {
                "id": "recipe_pick",
                "name": "Pick",
                "pools": {"scene|scene": ["x"]},
                "picks": {"scene|scene": "x", "bad": 3},
                "randomize": False,
            },
            "user",
        )
        self.assertFalse(recipe["randomize"])
        self.assertEqual(recipe["picks"], {"scene|scene": "x"})


class UserRecipeFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.user_path = os.path.join(self.tmp.name, "studio_recipes.json")
        patcher = mock.patch(
            "src.studio.recipes.studio_user_recipes_path", return_value=self.user_path
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_save_override_and_delete(self):
        merged = studio_recipes.save_recipe(
            {
                "id": "recipe_cozy_fantasy",
                "name": "Cozy Fantasy",
                "pools": {"scene|scene": ["scene_medieval_tavern_a"]},
            }
        )
        by_id = {recipe["id"]: recipe for recipe in merged}
        self.assertEqual(by_id["recipe_cozy_fantasy"]["origin"], "user")
        self.assertEqual(
            by_id["recipe_cozy_fantasy"]["pools"]["scene|scene"],
            ["scene_medieval_tavern_a"],
        )

        merged = studio_recipes.delete_recipe("recipe_cozy_fantasy")
        self.assertNotIn("recipe_cozy_fantasy", {recipe["id"] for recipe in merged})
        with open(self.user_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        self.assertIn(
            {"id": "recipe_cozy_fantasy", "deleted": True}, payload["recipes"]
        )

    def test_malformed_user_file_is_tolerated(self):
        with open(self.user_path, "w", encoding="utf-8") as handle:
            handle.write("{not json")
        recipes = studio_recipes.load_recipes()
        self.assertGreaterEqual(len(recipes), 6)


if __name__ == "__main__":
    unittest.main()
