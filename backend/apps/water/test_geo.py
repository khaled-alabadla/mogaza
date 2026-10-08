import json

from django.test import SimpleTestCase

from .geo import (Landmark, Point, describe_zone, direction_word, distance_m, geojson_centroid,
                  is_landmark_name)

HAIDAR = Landmark("دوار حيدر", Point(31.5100, 34.4600))


def square(lat, lon, d=0.0001):
    ring = [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]
    return json.dumps({"type": "FeatureCollection", "features": [{"geometry": {"type": "Polygon", "coordinates": [ring]}}]})


class GeoTests(SimpleTestCase):
    def test_geojson_centroid(self):
        point = geojson_centroid(square(31.51, 34.46))
        self.assertAlmostEqual(point.lat, 31.51004, places=4)
        self.assertAlmostEqual(point.lon, 34.46004, places=4)
        self.assertIsNone(geojson_centroid('{"type": "FeatureCollection", "features": []}'))
        self.assertIsNone(geojson_centroid("not json"))
        self.assertIsNone(geojson_centroid(square(40.0, 10.0)))  # outside Gaza: rejected

    def test_direction_and_distance(self):
        origin = HAIDAR.point
        self.assertEqual(direction_word(origin, Point(31.5100, 34.4630)), "شرق")
        self.assertEqual(direction_word(origin, Point(31.5100, 34.4570)), "غرب")
        self.assertEqual(direction_word(origin, Point(31.5130, 34.4600)), "شمال")
        self.assertEqual(direction_word(origin, Point(31.5070, 34.4600)), "جنوب")
        self.assertEqual(direction_word(origin, Point(31.5080, 34.4580)), "جنوب غرب")
        self.assertAlmostEqual(distance_m(origin, Point(31.5109, 34.4600)), 99.5, delta=1)

    def test_landmark_names(self):
        for name in ("دوار حيدر", " مفترق الزهارنة", "ميدان الشهداء", "جسر الشيخ رضوان", "مفترف الشباب"):
            self.assertTrue(is_landmark_name(name), name)
        self.assertFalse(is_landmark_name("مخبز عجور"))

    def test_describe_zone_near_and_direction(self):
        self.assertEqual(describe_zone(Point(31.5101, 34.4601), [HAIDAR], []), "محيط دوار حيدر")
        self.assertEqual(describe_zone(Point(31.5100, 34.4640), [HAIDAR], []), "شرق دوار حيدر")

    def test_describe_zone_is_unique_within_neighborhood(self):
        other = Landmark("مفترق الشعبية", Point(31.5100, 34.4700))
        name = describe_zone(Point(31.5100, 34.4640), [HAIDAR, other], ["شرق دوار حيدر"])
        self.assertEqual(name, "غرب مفترق الشعبية")

    def test_describe_zone_fallbacks(self):
        # far from every landmark → building name
        self.assertEqual(describe_zone(Point(31.40, 34.40), [HAIDAR], [], ["مخبز عجور"]), "محيط مخبز عجور")
        # no coordinates at all → building name
        self.assertEqual(describe_zone(None, [HAIDAR], [], ["مخبز عجور"]), "محيط مخبز عجور")
        self.assertIsNone(describe_zone(None, [HAIDAR], ["محيط مخبز عجور"], ["مخبز عجور"]))
